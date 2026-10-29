/**
 * Bundle Listing Round-Trip Depth
 *
 * bundle-listing-batching.test.js counts "waves" — stretches with any command
 * in flight — which collapses two overlapping chains into one wave. That is
 * how a listing that waited on 12 serial Redis round trips (~1s against an
 * ~85ms-away Redis) read as 7: the review lookup (record, then legacy key,
 * then versions, then manifest, then org link, then org) and the publisher
 * lookup (email, then user) ran beside other work, so their length never
 * showed.
 *
 * This mock measures the CRITICAL PATH instead. Every command issued before a
 * flush resolves in that flush — one round trip, as node-redis pipelining does
 * on the wire — and `rounds` counts flushes. Two chains running side by side
 * cost the longer of the two, which is what the caller actually waits for.
 *
 * Both KV clients are mocked onto one store: the listing reads the bundle
 * store through the backend client and package records through api/lib's.
 */

let rounds;
let pending = [];
let flushScheduled = false;

function flush() {
  flushScheduled = false;
  rounds++;
  const batch = pending;
  pending = [];
  for (const run of batch) run();
}

/** One command: resolves in the next flush, alongside everything issued with it. */
function cmd(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      pending.push(() => {
        try {
          resolve(fn(...args));
        } catch (err) {
          reject(err);
        }
      });
      if (!flushScheduled) {
        flushScheduled = true;
        setTimeout(flush, 0);
      }
    });
}

const store = new Map();
const sets = new Map();
const read = key => (store.has(key) ? store.get(key) : null);

const mockKv = {
  get: cmd(read),
  mGet: cmd(keys => keys.map(read)),
  sMembers: cmd(key => (sets.has(key) ? [...sets.get(key)] : [])),
  sIsMember: cmd((key, member) => (sets.get(key)?.has(member) ? 1 : 0)),
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));
jest.mock('../../../api/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));
jest.mock('../../../api/lib/auth-helpers', () => ({
  resolveUser: async () => null,
}));

const listHandler = require('../../../api/v2/bundles/index');

const PACKAGE_COUNT = 25;

/**
 * The expensive shape: nothing decided by an admin, so every package walks
 * the whole trusted-publisher fallback, and every publisher has an account.
 */
function seedRegistry() {
  store.clear();
  sets.clear();
  const packages = [];
  for (let i = 0; i < PACKAGE_COUNT; i++) {
    const pkg = `com.example.pkg${String(i).padStart(3, '0')}`;
    const email = `dev${i}@example.com`;
    packages.push(pkg);
    sets.set(`bundle-versions:${pkg}`, new Set(['1.0.0', '1.1.0']));
    for (const v of ['1.0.0', '1.1.0']) {
      store.set(
        `bundle:${pkg}/${v}`,
        JSON.stringify({
          json: {
            package: pkg,
            appVersion: v,
            metadata: { _ownerEmail: email },
          },
        })
      );
    }
    store.set(`pkg2org:${pkg}`, 'org-1');
    store.set(`email2user:${email}`, `user-${i}`);
    store.set(`user:user-${i}`, JSON.stringify({ verified: false }));
  }
  sets.set('bundles:all', new Set(packages));
  store.set('org:org-1', JSON.stringify({ slug: 'acme' }));
}

function makeReqRes(query = {}) {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
  return [{ method: 'GET', query, headers: {} }, res];
}

describe('GET /api/v2/bundles critical path', () => {
  beforeEach(() => {
    rounds = 0;
    seedRegistry();
  });

  // 4 to resolve manifests (index, versions, yank flags, manifests), then the
  // review fallback — record and legacy key together, then the publisher's
  // manifest and org beside each other — with the user lookups and package
  // records alongside. It was 12: each of those steps waited on the last.
  test('the listing waits on a fixed, short chain of round trips', async () => {
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(PACKAGE_COUNT);
    expect(res.body.every(b => b.verified === false)).toBe(true);
    expect(rounds).toBeLessThanOrEqual(7);
  });

  test('a single bundle lookup does not serialise its review and publisher checks', async () => {
    const [req, res] = makeReqRes({
      package: 'com.example.pkg001',
      version: '1.1.0',
    });
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body[0].verified).toBe(false);
    expect(res.body[0].publisherVerified).toBe(false);
    // Package record, manifest, counters, then the review chain (3) beside the
    // publisher chain (2). It was 12.
    expect(rounds).toBeLessThanOrEqual(6);
  });

  test('a trusted org still approves through the faster lookup', async () => {
    store.set('org:org-1', JSON.stringify({ slug: 'calimero-network' }));
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    expect(res.body.every(b => b.verified === true)).toBe(true);
  });

  test('an explicit decline still beats the trusted default', async () => {
    store.set('org:org-1', JSON.stringify({ slug: 'calimero-network' }));
    store.set(
      'pkg-review:com.example.pkg002',
      JSON.stringify({ state: 'declined' })
    );
    store.set('admin_verified:package:com.example.pkg002', '1');
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    const byPkg = Object.fromEntries(res.body.map(b => [b.package, b]));
    expect(byPkg['com.example.pkg002'].verified).toBe(false);
    expect(byPkg['com.example.pkg003'].verified).toBe(true);
  });
});
