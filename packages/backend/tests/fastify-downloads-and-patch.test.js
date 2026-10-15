/**
 * The Fastify server matches the Vercel handlers: one download count per client
 * per package per hour, and PATCH refuses changes to locked manifest fields.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const store = new Map();
const sets = new Map();
const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  setNXEx: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
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
jest.mock('../src/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(true),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('owner-key'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(s => s || null),
}));

const SESSION_SECRET = 'test-session-secret';
process.env.SESSION_SECRET = SESSION_SECRET;

const { buildServer } = require('../src/server');

const PKG = 'com.example.app';
const KEY = `bundle:${PKG}/1.0.0`;
const EMAIL = 'author@example.com';

const stored = {
  version: '1.0',
  package: PKG,
  appVersion: '1.0.0',
  metadata: {
    name: 'App',
    description: 'The current description.',
    author: 'author-user',
    _ownerEmail: EMAIL,
  },
  owners: ['owner-key'],
  interfaces: { exports: [], uses: [] },
  wasm: { path: 'app.wasm', hash: 'a'.repeat(64), size: 10 },
  signature: { algorithm: 'ed25519', publicKey: 'owner-key', signature: 's' },
};

let server;
beforeAll(async () => {
  server = await buildServer();
});
afterAll(() => server.close());

beforeEach(() => {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set([PKG]));
  sets.set(`bundle-versions:${PKG}`, new Set(['1.0.0']));
  store.set(KEY, JSON.stringify({ json: stored }));
  store.set(
    `user:u1`,
    JSON.stringify({ id: 'u1', email: EMAIL, username: 'author-user' })
  );
  store.set(`email2user:${EMAIL}`, 'u1');
});

const get = (url, ip) =>
  server.inject({ method: 'GET', url, remoteAddress: ip });
const count = () => Number(store.get(`downloads:${PKG}`) || 0);

describe('download counting', () => {
  test('the same IP reading a manifest twice counts once', async () => {
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '203.0.113.5');
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '203.0.113.5');
    expect(count()).toBe(1);
    expect(Number(store.get('downloads:total'))).toBe(1);
  });

  test('the list route with package and version counts once per client', async () => {
    const url = `/api/v2/bundles?package=${PKG}&version=1.0.0`;
    await get(url, '203.0.113.5');
    await get(url, '203.0.113.5');
    expect(count()).toBe(1);
  });

  test('two addresses in one IPv6 /64 count once', async () => {
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '2001:db8:1:2::1');
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '2001:db8:1:2:ffff::9');
    expect(count()).toBe(1);
  });

  test('different clients are counted separately', async () => {
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '203.0.113.5');
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '203.0.113.6');
    expect(count()).toBe(2);
  });

  test('artifact downloads share the manifest dedupe', async () => {
    const dir = path.join(__dirname, '../artifacts', PKG, '1.0.0');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app.mpk'), 'x');
    try {
      await get(`/artifacts/${PKG}/1.0.0/app.mpk`, '203.0.113.5');
      await get(`/artifacts/${PKG}/1.0.0/app.mpk`, '203.0.113.5');
    } finally {
      fs.rmSync(path.join(__dirname, '../artifacts', PKG), { recursive: true });
    }
    expect(count()).toBe(1);
  });

  test('a manifest read then an artifact read counts once', async () => {
    await get(`/api/v2/bundles/${PKG}/1.0.0`, '203.0.113.5');
    await get(`/artifacts/${PKG}/1.0.0/app.mpk`, '203.0.113.5');
    expect(count()).toBe(1);
  });
});

describe('PATCH locked fields', () => {
  const patch = overrides =>
    server.inject({
      method: 'PATCH',
      url: `/api/v2/bundles/${PKG}/1.0.0`,
      headers: {
        cookie: `app_registry_session=${jwt.sign(
          { sub: 'u1', email: EMAIL, name: EMAIL },
          SESSION_SECRET,
          { algorithm: 'HS256' }
        )}`,
        origin: 'https://apps.calimero.network',
      },
      payload: {
        ...stored,
        metadata: { ...stored.metadata, description: 'Edited.' },
        ...overrides,
      },
    });
  const saved = () => JSON.parse(store.get(KEY)).json;

  test.each([
    ['interfaces', { interfaces: { exports: ['x'], uses: [] } }],
    ['abi', { abi: { methods: [] } }],
    ['minRuntimeVersion', { minRuntimeVersion: '9.9.9' }],
  ])('changing %s is refused', async (_f, overrides) => {
    const r = await patch(overrides);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('invalid_manifest');
    expect(saved()).toEqual(stored);
  });

  test('cannot rewrite the recorded manager', async () => {
    const r = await patch({
      metadata: { ...stored.metadata, _ownerEmail: 'someone@example.com' },
    });
    expect(r.statusCode).toBe(200);
    expect(saved().metadata._ownerEmail).toBe(stored.metadata._ownerEmail);
  });

  test('a metadata-only edit still succeeds', async () => {
    const r = await patch({});
    expect(r.statusCode).toBe(200);
    expect(saved().metadata.description).toBe('Edited.');
  });
});
