/**
 * Org slugs naming Calimero are admin-only, in both runtimes: the Vercel
 * function (api/v2/orgs/index.js) and the Fastify server for self-hosting.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
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
  hSet: async (k, f, v) => {
    if (!hashes.has(k)) hashes.set(k, {});
    hashes.get(k)[f] = v;
    return 1;
  },
  hDel: async () => 0,
  setNX: async () => true,
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

const vercelHandler = require('../../../api/v2/orgs/index');
const { buildServer } = require('../src/server');
const { isReservedOrgSlug } = require('../../../shared/org-slugs');
const { createPackageReview } = require('../../../shared/package-review');

const USER_TOKEN = 'user-token';
const ADMIN_TOKEN = 'admin-token';
const USER = 'carol@example.com';
const ADMIN = 'ops@example.com';

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  store.set(`apitoken:${USER_TOKEN}`, JSON.stringify({ email: USER }));
  store.set(`apitoken:${ADMIN_TOKEN}`, JSON.stringify({ email: ADMIN }));
  sets.set('admin:set', new Set([ADMIN]));
}

async function createViaVercel(token, slug) {
  const res = {
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
  await vercelHandler(
    {
      method: 'POST',
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'Some Org', slug },
    },
    res
  );
  return res.statusCode;
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => seed());

async function createViaFastify(token, slug) {
  const response = await server.inject({
    method: 'POST',
    url: '/api/v2/orgs',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Some Org', slug },
  });
  return response.statusCode;
}

describe.each([
  ['vercel', createViaVercel],
  ['fastify', createViaFastify],
])('%s: POST /api/v2/orgs', (_runtime, create) => {
  it.each(['calimero', 'calimero-apps', 'thecalimero', 'Calimero'])(
    'refuses %s to a non-admin',
    async slug => {
      expect(await create(USER_TOKEN, slug)).toBe(403);
      expect(store.has(`org:${slug.toLowerCase()}`)).toBe(false);
    }
  );

  it('lets an admin claim a reserved slug', async () => {
    expect(await create(ADMIN_TOKEN, 'calimero')).toBe(201);
  });

  it('leaves ordinary slugs open to anyone', async () => {
    expect(await create(USER_TOKEN, 'carols-apps')).toBe(201);
  });
});

describe('isReservedOrgSlug', () => {
  it('matches any slug containing calimero, case-insensitively', () => {
    expect(isReservedOrgSlug('calimero')).toBe(true);
    expect(isReservedOrgSlug('my-CALIMERO-org')).toBe(true);
    expect(isReservedOrgSlug('acme')).toBe(false);
    expect(isReservedOrgSlug(undefined)).toBe(false);
  });
});

describe('trusted org slugs', () => {
  const trustedAs = orgSlug =>
    createPackageReview(
      { get: async () => null },
      { publisherOf: async () => ({ email: 'x@example.com', orgSlug }) }
    ).getReview('com.example.app');

  it('trusts the registered calimero-network org', async () => {
    expect((await trustedAs('calimero-network')).state).toBe('approved');
  });

  it('does not trust a bare "calimero" slug', async () => {
    expect((await trustedAs('calimero')).state).toBe('pending');
  });
});
