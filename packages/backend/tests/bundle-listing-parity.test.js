/**
 * Bundle Listing Endpoint Parity Tests
 *
 * GET /api/v2/bundles exists twice: as the deployed Vercel function
 * (api/v2/bundles/index.js) and on the Fastify server
 * (packages/backend/src/server.js) for Docker/self-hosted. This file drives
 * BOTH real endpoints with the same queries and records exactly where they
 * agree and where they do not.
 *
 * ── The known divergence ────────────────────────────────────────────────────
 * `?package=X` with no `all_versions` returns different things:
 *
 *   Vercel   → the latest version only. All-versions requires all_versions=true,
 *              which also populates `yanked`.
 *   Fastify  → every version of X, and never populates `yanked`. It does not
 *              read the `all_versions` param at all.
 *
 * This is PRE-EXISTING, not introduced by the batching work. On the commit
 * before it, the Vercel handler branched on `all_versions === 'true' && pkg`
 * while Fastify used `const versionList = pkg ? versions : [versions[0]]`.
 * The shared helpers preserved each side's behaviour exactly.
 *
 * It is pinned rather than unified here because aligning it is an API decision
 * with client impact in both directions: making Vercel return full history for
 * `?package=X` changes the production contract the frontend and CLI depend on,
 * and making Fastify require `all_versions=true` breaks self-hosted callers
 * that rely on `?package=X` returning history. Whichever way it goes should be
 * a deliberate change with its own release note — and these tests will fail
 * loudly when someone makes it, which is the point.
 */

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async k => {
    const next = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
    store.set(k, String(next));
    return next;
  },
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async () => 0,
  sIsMember: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
  hDel: async () => 0,
  setNX: async () => true,
  scanKeys: async () => [],
};

jest.mock('../../../packages/backend/src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));
jest.mock('../../../api/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

const vercelHandler = require('../../../api/v2/bundles/index');
const { buildServer } = require('../src/server');

const PKG = 'com.example.app';
const VERSIONS = ['1.0.0', '1.2.0', '1.10.0'];

function seed() {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set([PKG, 'com.example.other']));
  sets.set(`bundle-versions:${PKG}`, new Set(VERSIONS));
  sets.set('bundle-versions:com.example.other', new Set(['1.0.0']));

  for (const version of VERSIONS) {
    store.set(
      `bundle:${PKG}/${version}`,
      JSON.stringify({
        json: {
          package: PKG,
          appVersion: version,
          metadata: { author: 'alice' },
          signature: { pubkey: 'pk-alice' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );
  }
  store.set(
    'bundle:com.example.other/1.0.0',
    JSON.stringify({
      json: {
        package: 'com.example.other',
        appVersion: '1.0.0',
        metadata: { author: 'bob' },
        signature: { pubkey: 'pk-bob' },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
}

/** Invoke the Vercel function with a plain query object. */
async function callVercel(query) {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
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
  await vercelHandler({ method: 'GET', query, headers: {} }, res);
  return res;
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => seed());

/** Invoke the real Fastify route. */
async function callFastify(qs) {
  const response = await server.inject({
    method: 'GET',
    url: `/api/v2/bundles${qs}`,
  });
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.payload),
  };
}

describe('where the two endpoints agree', () => {
  test('the default browse listing returns the latest version per package', async () => {
    const vercel = await callVercel({});
    const fastify = await callFastify('');

    const shape = r => r.body.map(b => `${b.package}@${b.appVersion}`).sort();

    // 1.10.0 > 1.2.0 — both must sort with semver, not lexically.
    expect(shape(vercel)).toEqual([
      'com.example.app@1.10.0',
      'com.example.other@1.0.0',
    ]);
    expect(shape(fastify)).toEqual(shape(vercel));
  });

  test('neither exposes internal metadata in the browse listing', async () => {
    const vercel = await callVercel({});
    const fastify = await callFastify('');

    for (const result of [vercel, fastify]) {
      for (const bundle of result.body) {
        expect(bundle.metadata._ownerEmail).toBeUndefined();
        expect(bundle.metadata._adminVerified).toBeUndefined();
      }
    }
  });

  test('an unmatched developer filter yields an empty listing on both', async () => {
    const vercel = await callVercel({ developer: 'pk-nobody' });
    const fastify = await callFastify('?developer=pk-nobody');

    expect(vercel.body).toEqual([]);
    expect(fastify.body).toEqual([]);
  });
});

describe('KNOWN DIVERGENCE: ?package=X without all_versions', () => {
  // See the file header. These assertions describe current behaviour on each
  // side; they are not an endorsement of the difference.

  test('Vercel returns the latest version only', async () => {
    const res = await callVercel({ package: PKG });

    expect(res.body.map(b => b.appVersion)).toEqual(['1.10.0']);
  });

  test('Fastify returns every version', async () => {
    const res = await callFastify(`?package=${PKG}`);

    expect(res.body.map(b => b.appVersion)).toEqual([
      '1.10.0',
      '1.2.0',
      '1.0.0',
    ]);
  });

  test('the two therefore disagree on result count for the same query', async () => {
    const vercel = await callVercel({ package: PKG });
    const fastify = await callFastify(`?package=${PKG}`);

    // Fails the day someone aligns them — which is the intent.
    expect(vercel.body).toHaveLength(1);
    expect(fastify.body).toHaveLength(3);
  });
});

describe('KNOWN DIVERGENCE: all_versions and yank status', () => {
  test('Vercel honours all_versions=true and populates yanked', async () => {
    store.set(`bundle-yanked:${PKG}/1.2.0`, '1');

    const res = await callVercel({ package: PKG, all_versions: 'true' });

    expect(res.body.map(b => b.appVersion)).toEqual([
      '1.10.0',
      '1.2.0',
      '1.0.0',
    ]);
    expect(res.body.map(b => b.yanked)).toEqual([false, true, false]);
  });

  test('Fastify ignores all_versions and never populates yanked', async () => {
    store.set(`bundle-yanked:${PKG}/1.2.0`, '1');

    const res = await callFastify(`?package=${PKG}&all_versions=true`);

    // Same versions as without the flag — the param is not read at all.
    expect(res.body.map(b => b.appVersion)).toHaveLength(3);
    expect(res.body.every(b => !('yanked' in b))).toBe(true);
  });

  test('Vercel rejects all_versions without a package', async () => {
    const res = await callVercel({ all_versions: 'true' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_params');
  });

  test('Fastify has no such validation', async () => {
    const res = await callFastify('?all_versions=true');

    expect(res.statusCode).toBe(200);
  });
});

describe('KNOWN GAP: yank status is absent from the browse listing', () => {
  test('a yanked latest version is not flagged in the default listing', async () => {
    // Pre-existing on both sides: the per-package-latest listing never resolves
    // bundle-yanked:*, so a security-yanked latest release is presented exactly
    // like a healthy one. Cheap to fix — the lookup rides the same pipelined
    // round trip — but it changes the response shape of the most-consumed
    // endpoint, so it needs to be a deliberate API decision.
    store.set(`bundle-yanked:${PKG}/1.10.0`, '1');

    const vercel = await callVercel({});
    const fastify = await callFastify('');

    const entry = r => r.body.find(b => b.package === PKG);
    expect('yanked' in entry(vercel)).toBe(false);
    expect('yanked' in entry(fastify)).toBe(false);
  });
});
