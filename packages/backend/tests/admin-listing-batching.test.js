/**
 * Admin and org listing batching.
 *
 * Same property `bundle-listing-batching.test.js` pins for the public bundle
 * listing, applied to the four screens that had never had it: the moderation
 * review queue, the admin Users tab, the admin Packages tab, and an
 * organization's member table. Each one awaited two to four times per row
 * inside a `for` loop, so the number of SEQUENTIAL Redis round trips grew
 * with the number of rows.
 *
 * ⚠️ THE ASSERTION IS ABOUT WAVES, NOT TOTAL COMMANDS. Batching does not
 * reduce how many keys are read — it reduces how many times the handler stops
 * and waits. `waves` below counts exactly that: every mock command parks on a
 * timer, so commands issued in the same tick overlap and count as one wave,
 * which is what node-redis pipelining does on the wire. A serialised `await`
 * goes idle between each command and so counts as one wave apiece.
 *
 * ⚠️ THE ROW COUNT IS DELIBERATELY LARGE. With three rows a serial loop and a
 * batched one look nearly identical; the point is that the wave count must be
 * FLAT as rows grow, so the same handler is measured at two sizes and the
 * counts compared.
 */

const PACKAGE_COUNT = 40;
const USER_COUNT = 40;
const MEMBER_COUNT = 40;

let waves;
let inFlight;

/** Wrap a mock command so concurrent issues collapse into a single wave. */
function tracked(fn) {
  return async (...args) => {
    if (inFlight === 0) waves++;
    inFlight++;
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      return fn(...args);
    } finally {
      inFlight--;
    }
  };
}

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: tracked(key => (store.has(key) ? store.get(key) : null)),
  set: tracked((key, value) => (store.set(key, value), 'OK')),
  del: tracked(key => (store.delete(key) ? 1 : 0)),
  sMembers: tracked(key => (sets.has(key) ? [...sets.get(key)] : [])),
  sAdd: tracked((key, ...members) => {
    if (!sets.has(key)) sets.set(key, new Set());
    members.flat().forEach(m => sets.get(key).add(String(m)));
    return members.length;
  }),
  sRem: tracked((key, m) => (sets.get(key)?.delete(String(m)) ? 1 : 0)),
  sIsMember: tracked((key, m) => (sets.get(key)?.has(String(m)) ? 1 : 0)),
  hGet: tracked((key, field) => hashes.get(key)?.[field] ?? null),
  hGetAll: tracked(key => hashes.get(key) ?? {}),
  hSet: tracked((key, obj) => {
    hashes.set(key, { ...(hashes.get(key) ?? {}), ...obj });
    return Object.keys(obj).length;
  }),
  hDel: tracked((key, ...fields) => {
    const h = hashes.get(key);
    if (!h) return 0;
    let n = 0;
    fields.flat().forEach(f => {
      if (h[f] !== undefined) {
        delete h[f];
        n++;
      }
    });
    return n;
  }),
  scanKeys: tracked(pattern => {
    const prefix = String(pattern).replace(/\*$/, '');
    return [...store.keys()].filter(k => k.startsWith(prefix));
  }),
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

const ADMIN = 'admin@calimero.network';

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    requireAdmin: async () => ({ id: ADMIN, email: ADMIN }),
    requireOrgAdminOrOwner: async () => ({ id: ADMIN, email: ADMIN }),
    requireOrgOwner: async () => ({ id: ADMIN, email: ADMIN }),
  };
});

// The bucket never enters these measurements: assets are read from the Redis
// index, and object bytes are only fetched by the `raw` route.
jest.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({}) };
    }
  },
}));

process.env.GCS_BUCKET = 'test-bucket';

const queueHandler = require('../../../api/admin/review-queue');
const adminUsersHandler = require('../../../api/admin/users/index');
const adminPackagesHandler = require('../../../api/admin/packages/index');
const membersHandler = require('../../../api/v2/orgs/[orgId]/members/index');

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
    send(p) {
      this.body = p;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

function reset() {
  store.clear();
  sets.clear();
  hashes.clear();
  waves = 0;
  inFlight = 0;
}

/** N packages, each with a manifest, a download counter and one asset. */
function seedPackages(count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    const pkg = `com.example.app${String(i).padStart(3, '0')}`;
    names.push(pkg);
    sets.set(`bundle-versions:${pkg}`, new Set(['1.0.0', '1.1.0']));
    store.set(
      `bundle:${pkg}/1.1.0`,
      JSON.stringify({
        json: {
          package: pkg,
          appVersion: '1.1.0',
          metadata: { author: 'someone', name: `App ${i}` },
          signature: { pubkey: 'pk' },
        },
      })
    );
    store.set(`downloads:${pkg.toLowerCase()}`, String(i));
    // One asset, so the package qualifies for the review queue. No decision
    // is recorded, which means pending — the queue's default-deny state.
    store.set(
      `pkg-assets:${pkg}`,
      JSON.stringify([
        {
          id: `a${i}`,
          key: `assets/${pkg}/a${i}.png`,
          kind: 'image',
          contentType: 'image/png',
          bytes: 10,
          alt: '',
          order: 0,
          uploadedAt: '2026-09-01T00:00:00.000Z',
        },
      ])
    );
  }
  sets.set('bundles:all', new Set(names));
  return names;
}

function seedUsers(count) {
  for (let i = 0; i < count; i++) {
    const email = `user${String(i).padStart(3, '0')}@example.com`;
    store.set(
      `user:${i}`,
      JSON.stringify({ id: String(i), email, username: `u${i}` })
    );
  }
}

function seedOrgWithMembers(orgId, count) {
  store.set(
    `org:${orgId}`,
    JSON.stringify({ id: orgId, name: 'Org', slug: 'org' })
  );
  const emails = [];
  const roles = {};
  for (let i = 0; i < count; i++) {
    const email = `member${String(i).padStart(3, '0')}@example.com`;
    emails.push(email);
    roles[email] = i === 0 ? 'owner' : 'member';
    store.set(
      `user:by_email:${email}`,
      JSON.stringify({ id: String(i), email, username: `m${i}` })
    );
  }
  sets.set(`org:${orgId}:members`, new Set(emails));
  hashes.set(`org:${orgId}:roles`, roles);
  return emails;
}

/** Run a handler and report how many sequential waves it cost. */
async function measure(run) {
  waves = 0;
  inFlight = 0;
  const res = makeRes();
  await run(res);
  return { res, waves };
}

describe('the review queue', () => {
  it('does not add a wave per package', async () => {
    reset();
    seedPackages(4);
    const small = await measure(res =>
      queueHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    reset();
    seedPackages(PACKAGE_COUNT);
    const large = await measure(res =>
      queueHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    expect(small.res.statusCode).toBe(200);
    expect(large.res.statusCode).toBe(200);
    // Every seeded package has an asset and no decision, so all of them are
    // genuinely in the queue — the batching is not being flattered by a
    // filter that dropped most of the rows.
    expect(large.res.body.count).toBe(PACKAGE_COUNT);
    expect(large.waves).toBe(small.waves);
  });
});

describe('the admin users tab', () => {
  it('does not add a wave per user', async () => {
    reset();
    seedUsers(4);
    const small = await measure(res =>
      adminUsersHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    reset();
    seedUsers(USER_COUNT);
    const large = await measure(res =>
      adminUsersHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    expect(large.res.statusCode).toBe(200);
    expect(large.res.body.users).toHaveLength(USER_COUNT);
    expect(large.waves).toBe(small.waves);
  });
});

describe('the admin packages tab', () => {
  it('does not add a wave per package', async () => {
    reset();
    seedPackages(4);
    const small = await measure(res =>
      adminPackagesHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    reset();
    seedPackages(PACKAGE_COUNT);
    const large = await measure(res =>
      adminPackagesHandler({ method: 'GET', query: {}, headers: {} }, res)
    );

    expect(large.res.statusCode).toBe(200);
    expect(large.res.body.packages).toHaveLength(PACKAGE_COUNT);
    expect(large.waves).toBe(small.waves);
  });
});

describe('an organization member table', () => {
  it('does not add a wave per member, and still reports every role', async () => {
    reset();
    seedOrgWithMembers('o1', 4);
    const small = await measure(res =>
      membersHandler(
        { method: 'GET', query: { orgId: 'o1' }, headers: {} },
        res
      )
    );

    reset();
    seedOrgWithMembers('o1', MEMBER_COUNT);
    const large = await measure(res =>
      membersHandler(
        { method: 'GET', query: { orgId: 'o1' }, headers: {} },
        res
      )
    );

    expect(large.res.statusCode).toBe(200);
    expect(large.res.body.members).toHaveLength(MEMBER_COUNT);
    // The roles now come from one hash read rather than two `hGet`s per
    // member, so this checks the batched lookup still answers the same.
    expect(large.res.body.members[0].role).toBe('owner');
    expect(large.res.body.members[1].role).toBe('member');
    expect(large.waves).toBe(small.waves);
  });
});
