/**
 * Privacy regression tests: account email addresses must not leak through the
 * public read/publish API.
 *
 *   1. GET /api/v2/orgs/:orgId/members hides `email` from a stranger and shows
 *      it to a member or a site admin.
 *   2. GET /api/v2/bundles/:package/:version strips internal `_`-prefixed
 *      metadata (notably `metadata._ownerEmail`).
 *   3. POST /api/v2/bundles/push never stores an email as the public `author`.
 *
 * Everything runs against an in-memory Redis stand-in, so it stays in the
 * default `pnpm test` run.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async k => {
    const next = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
    store.set(k, String(next));
    return next;
  },
  setNX: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async () => 0,
  sIsMember: async (k, m) => (sets.has(k) ? sets.get(k).has(m) : false),
  hGetAll: async k => (hashes.has(k) ? { ...hashes.get(k) } : {}),
  hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
  hSet: async () => 0,
  hDel: async () => 0,
  scanKeys: async () => [],
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
// The Vercel version-detail handler opens its own Redis client when REDIS_URL
// is set; route it at the same in-memory store.
jest.mock('redis', () => ({
  createClient: () => ({
    on() {},
    connect: async () => {},
    get: async k => mockKv.get(k),
  }),
}));
process.env.REDIS_URL = 'redis://email-privacy-test';

// The push handler verifies signatures via api/lib/verify; stub it so the test
// exercises author handling rather than crypto.
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

const membersHandler = require('../../../api/v2/orgs/[orgId]/members/index');
const detailHandler = require('../../../api/v2/bundles/[package]/[version]');
const pushHandler = require('../../../api/v2/bundles/push');
const { TEST_ICON } = require('./helpers/publishable');

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
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

beforeEach(() => {
  store.clear();
  sets.clear();
  hashes.clear();
});

describe('GET /api/v2/orgs/:orgId/members email exposure', () => {
  const ORG_ID = 'acme';
  const OWNER = 'owner@acme.io';
  const MEMBER = 'member@acme.io';
  const SITE_ADMIN = 'staff@calimero.network'; // admin by domain, not a member

  function seed() {
    store.set(
      `org:${ORG_ID}`,
      JSON.stringify({ id: ORG_ID, name: 'Acme', slug: 'acme' })
    );
    sets.set(`org:${ORG_ID}:members`, new Set([OWNER, MEMBER]));
    hashes.set(`org:${ORG_ID}:roles`, {
      [OWNER]: 'owner',
      [MEMBER]: 'member',
    });
    store.set('apitoken:tok-member', JSON.stringify({ email: MEMBER }));
    store.set('apitoken:tok-admin', JSON.stringify({ email: SITE_ADMIN }));
  }

  async function callAs(authorization) {
    seed();
    const res = makeRes();
    await membersHandler(
      {
        method: 'GET',
        query: { orgId: ORG_ID },
        headers: authorization ? { authorization } : {},
      },
      res
    );
    return res;
  }

  test('a stranger (no auth) gets the public shape with NO email', async () => {
    const res = await callAs(undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body.members).toHaveLength(2);
    for (const m of res.body.members) {
      expect(m).not.toHaveProperty('email');
      // The public shape the UI keys on is still present.
      expect(m).toHaveProperty('username');
      expect(m).toHaveProperty('role');
      expect(m).toHaveProperty('verified');
      expect(m).toHaveProperty('isBot');
    }
  });

  test('a member of the org sees emails', async () => {
    const res = await callAs('Bearer tok-member');
    expect(res.statusCode).toBe(200);
    expect(res.body.members.map(m => m.email).sort()).toEqual(
      [OWNER, MEMBER].sort()
    );
  });

  test('a site admin who is not a member sees emails', async () => {
    const res = await callAs('Bearer tok-admin');
    expect(res.statusCode).toBe(200);
    expect(res.body.members.map(m => m.email).sort()).toEqual(
      [OWNER, MEMBER].sort()
    );
  });
});

describe('GET /api/v2/bundles/:package/:version does not leak _ownerEmail', () => {
  const PKG = 'com.example.app';
  const VERSION = '1.0.0';

  test('internal _-prefixed metadata is stripped from the response', async () => {
    store.set(
      `bundle:${PKG}/${VERSION}`,
      JSON.stringify({
        json: {
          package: PKG,
          appVersion: VERSION,
          metadata: {
            name: 'Example',
            author: 'alice',
            _ownerEmail: 'alice@secret.example',
            _adminVerified: true,
          },
          signature: { pubkey: 'pk-alice' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );

    const res = makeRes();
    await detailHandler(
      { method: 'GET', query: { package: PKG, version: VERSION }, headers: {} },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.metadata).toBeDefined();
    expect(res.body.metadata._ownerEmail).toBeUndefined();
    expect(res.body.metadata._adminVerified).toBeUndefined();
    // No internal key survives, and the public author is preserved.
    for (const key of Object.keys(res.body.metadata)) {
      expect(key.startsWith('_')).toBe(false);
    }
    expect(res.body.metadata.author).toBe('alice');
    // The whole serialized response carries no owner email.
    expect(JSON.stringify(res.body)).not.toContain('alice@secret.example');
  });
});

describe('POST /api/v2/bundles/push never stores an email as author', () => {
  const PKG = 'com.example.new';
  const VERSION = '1.0.0';
  const EMAIL = 'nousername@example.com';

  test('a publisher with no username publishes with no email author', async () => {
    store.set('apitoken:tok-push', JSON.stringify({ email: EMAIL }));

    const res = makeRes();
    await pushHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok-push' },
        body: {
          version: '1.0',
          package: PKG,
          appVersion: VERSION,
          metadata: {
            name: 'New App',
            description: 'A brand new app used to exercise author handling.',
            category: 'developer-tools',
            icon: TEST_ICON,
          },
          wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
          signature: {
            algorithm: 'ed25519',
            publicKey: 'dGVzdC1wdWJrZXk',
            signature: 'dGVzdC1zaWduYXR1cmU',
          },
        },
      },
      res
    );

    expect(res.statusCode).toBe(201);

    const stored = JSON.parse(store.get(`bundle:${PKG}/${VERSION}`)).json;
    // The email is kept privately for ownership checks...
    expect(stored.metadata._ownerEmail).toBe(EMAIL);
    // ...but never becomes the public author.
    expect(stored.metadata.author).not.toBe(EMAIL);
    expect(stored.metadata.author ?? null).toBeNull();
  });

  function pushBody(pkg, version, metadata) {
    return {
      version: '1.0',
      package: pkg,
      appVersion: version,
      metadata: {
        name: 'New App',
        description: 'A brand new app used to exercise author handling.',
        category: 'developer-tools',
        icon: TEST_ICON,
        ...metadata,
      },
      wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
      signature: {
        algorithm: 'ed25519',
        publicKey: 'dGVzdC1wdWJrZXk',
        signature: 'dGVzdC1zaWduYXR1cmU',
      },
    };
  }

  async function push(token, body) {
    const res = makeRes();
    await pushHandler(
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body },
      res
    );
    return res;
  }

  test('a manifest-supplied author is never stored for a user with no username', async () => {
    store.set('apitoken:tok-push', JSON.stringify({ email: EMAIL }));

    const res = await push(
      'tok-push',
      pushBody(PKG, VERSION, { author: 'someone' })
    );
    expect(res.statusCode).toBe(201);

    const stored = JSON.parse(store.get(`bundle:${PKG}/${VERSION}`)).json;
    expect(stored.metadata.author ?? null).toBeNull();
    expect(stored.metadata._ownerEmail).toBe(EMAIL);
  });

  test('the stored author is the uploader username, not the manifest value', async () => {
    const OWNER = 'withname@example.com';
    store.set('apitoken:tok-named', JSON.stringify({ email: OWNER }));
    store.set(`email2user:${OWNER}`, 'u-named');
    store.set(
      'user:u-named',
      JSON.stringify({ id: 'u-named', email: OWNER, username: 'realname' })
    );

    const res = await push(
      'tok-named',
      pushBody(PKG, VERSION, { author: 'someone' })
    );
    expect(res.statusCode).toBe(201);

    const stored = JSON.parse(store.get(`bundle:${PKG}/${VERSION}`)).json;
    expect(stored.metadata.author).toBe('realname');
  });
});
