const jwt = require('jsonwebtoken');

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async () => 1,
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async () => 1,
  sRem: async () => 0,
  sIsMember: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
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

const mockProfiles = {
  'bob.private@gmail.com': { username: null },
  'carol@example.com': { username: 'carol' },
};
jest.mock('../../../api/lib/user-storage', () => ({
  ...jest.requireActual('../../../api/lib/user-storage'),
  getUserByEmail: async email => mockProfiles[email] ?? null,
}));
jest.mock('../src/lib/user-storage', () => ({
  ...jest.requireActual('../src/lib/user-storage'),
  getUserByEmail: async email => mockProfiles[email] ?? null,
}));

const SESSION_SECRET = 'author-filter-test-secret';
process.env.SESSION_SECRET = SESSION_SECRET;

const listHandler = require('../../../api/v2/bundles/index');
const { buildServer } = require('../src/server');

function put(pkg, metadata) {
  store.set(
    `bundle:${pkg}/1.0.0`,
    JSON.stringify({
      json: {
        package: pkg,
        appVersion: '1.0.0',
        metadata,
        signature: { pubkey: `pk-${pkg}` },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
  sets.set(`bundle-versions:${pkg}`, new Set(['1.0.0']));
}

function seed() {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set(['com.bob.app', 'com.carol.app']));
  put('com.bob.app', { _ownerEmail: 'bob.private@gmail.com' });
  put('com.carol.app', {
    author: 'carol',
    _ownerEmail: 'carol@example.com',
  });
}

function sessionCookie(email) {
  const token = jwt.sign(
    { sub: `u-${email}`, email, name: email },
    SESSION_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
    }
  );
  return `app_registry_session=${token}`;
}

function makeRes() {
  return {
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
}

async function vercel(query, headers = {}) {
  const res = makeRes();
  await listHandler({ method: 'GET', query, headers }, res);
  return res;
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  await server?.close();
});

beforeEach(seed);

async function fastify(query, headers = {}) {
  const res = await server.inject({
    method: 'GET',
    url: `/api/v2/bundles?${new URLSearchParams(query)}`,
    headers,
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.payload),
    headers: res.headers,
  };
}

describe.each([
  ['vercel', vercel],
  ['fastify', fastify],
])('GET /api/v2/bundles author and mine filters (%s)', (_name, call) => {
  test('an owner email does not match the author filter', async () => {
    const res = await call({ author: 'bob.private@gmail.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('a username still matches the author filter', async () => {
    const res = await call({ author: 'carol' });

    expect(res.body.map(b => b.package)).toEqual(['com.carol.app']);
  });

  test('mine requires a signed-in caller and is never cached', async () => {
    const res = await call({ mine: '1' });

    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('mine lists what the signed-in account published, username or not', async () => {
    const res = await call(
      { mine: '1' },
      { cookie: sessionCookie('bob.private@gmail.com') }
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.map(b => b.package)).toEqual(['com.bob.app']);
    expect(res.body[0].metadata._ownerEmail).toBeUndefined();
  });

  test('mine does not list another account’s packages', async () => {
    const res = await call(
      { mine: '1' },
      { cookie: sessionCookie('carol@example.com') }
    );

    expect(res.body.map(b => b.package)).toEqual(['com.carol.app']);
  });

  test('mine keeps a fully yanked package, flagged', async () => {
    store.set('bundle-yanked:com.bob.app/1.0.0', '1');
    const res = await call(
      { mine: '1' },
      { cookie: sessionCookie('bob.private@gmail.com') }
    );

    expect(res.body.map(b => [b.package, b.yanked])).toEqual([
      ['com.bob.app', true],
    ]);
  });

  test('mine cannot be combined with all_versions', async () => {
    const res = await call({ mine: '1', all_versions: 'true', package: 'x' });

    expect(res.statusCode).toBe(400);
  });
});
