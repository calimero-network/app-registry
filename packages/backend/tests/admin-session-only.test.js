/**
 * Site-admin routes accept only an interactive session, and staff-domain
 * admin access can be removed by another admin. Covers the Vercel handlers
 * and the Fastify server.
 */

const jwt = require('jsonwebtoken');

const store = new Map();
const sets = new Map();
const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};
const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => (store.delete(k) || sets.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...setFor(k)] : []),
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sRem: async (k, ...m) => (
    m.flat().forEach(x => setFor(k).delete(String(x))),
    1
  ),
  sIsMember: async (k, m) => setFor(k).has(String(m)),
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
  hDel: async () => 0,
  incr: async () => 1,
  scanKeys: async pattern =>
    pattern === 'user:*'
      ? [...store.keys()].filter(k => k.startsWith('user:'))
      : [],
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

const SESSION_SECRET = 'test-session-secret';
process.env.SESSION_SECRET = SESSION_SECRET;

const usersHandler = require('../../../api/admin/users/index');
const userHandler = require('../../../api/admin/users/[userId]');
const checkHandler = require('../../../api/admin/check');
const { isAdmin } = require('../../../api/lib/admin-storage');
const { buildServer } = require('../src/server');

const STAFF = 'staff@calimero.network';
const STAFF2 = 'other@calimero.network';
const OUTSIDE_ADMIN = 'ops@example.io';

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

function sessionToken(email) {
  return jwt.sign({ sub: `u-${email}`, email, name: email }, SESSION_SECRET, {
    algorithm: 'HS256',
  });
}

const cookie = email => ({
  cookie: `app_registry_session=${sessionToken(email)}`,
  origin: 'https://apps.calimero.network',
});
const bearer = token => ({ authorization: `Bearer ${token}` });

function seedUser(email) {
  const id = `u-${email}`;
  store.set(`user:${id}`, JSON.stringify({ id, email, username: null }));
  store.set(`email2user:${email}`, id);
  return id;
}

async function call(handler, req) {
  const res = makeRes();
  await handler({ query: {}, body: {}, ...req }, res);
  return res;
}

beforeEach(() => {
  store.clear();
  sets.clear();
  seedUser(STAFF);
  seedUser(STAFF2);
  seedUser(OUTSIDE_ADMIN);
  setFor('admin:set').add(OUTSIDE_ADMIN);
  store.set('apitoken:tok-staff', JSON.stringify({ email: STAFF }));
});

describe('Vercel /api/admin/* needs a session', () => {
  test('an admin API token is refused', async () => {
    const res = await call(usersHandler, {
      method: 'GET',
      headers: bearer('tok-staff'),
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  test('the same admin with a session cookie is allowed', async () => {
    const res = await call(usersHandler, {
      method: 'GET',
      headers: cookie(STAFF),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.users.length).toBe(3);
  });

  test('an admin mutation with an API token changes nothing', async () => {
    const res = await call(userHandler, {
      method: 'PATCH',
      headers: bearer('tok-staff'),
      query: { userId: `u-${OUTSIDE_ADMIN}` },
      body: { action: 'remove_admin' },
    });
    expect(res.statusCode).toBe(401);
    expect(await isAdmin(OUTSIDE_ADMIN)).toBe(true);
  });

  test('/api/admin/check ignores API tokens', async () => {
    const tokenRes = await call(checkHandler, {
      method: 'GET',
      headers: bearer('tok-staff'),
    });
    expect(tokenRes.statusCode).toBe(401);
    const sessionRes = await call(checkHandler, {
      method: 'GET',
      headers: cookie(STAFF),
    });
    expect(sessionRes.body).toEqual({ isAdmin: true });
  });
});

describe('staff-domain admin access is removable', () => {
  const patch = (actor, target, action) =>
    call(userHandler, {
      method: 'PATCH',
      headers: cookie(actor),
      query: { userId: `u-${target}` },
      body: { action },
    });

  test('another admin removes and restores it', async () => {
    expect(await isAdmin(STAFF2)).toBe(true);

    expect((await patch(STAFF, STAFF2, 'remove_admin')).statusCode).toBe(200);
    expect(await isAdmin(STAFF2)).toBe(false);

    const listed = await call(usersHandler, {
      method: 'GET',
      headers: cookie(STAFF),
    });
    const row = listed.body.users.find(u => u.email === STAFF2);
    expect(row.isAdmin).toBe(false);

    const refused = await call(usersHandler, {
      method: 'GET',
      headers: cookie(STAFF2),
    });
    expect(refused.statusCode).toBe(403);

    expect((await patch(STAFF, STAFF2, 'make_admin')).statusCode).toBe(200);
    expect(await isAdmin(STAFF2)).toBe(true);
  });

  test('an admin cannot remove their own access', async () => {
    const res = await patch(STAFF, STAFF, 'remove_admin');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('cannot_remove_self');
    expect(await isAdmin(STAFF)).toBe(true);
  });

  test('a non-staff admin is removed as before', async () => {
    expect((await patch(STAFF, OUTSIDE_ADMIN, 'remove_admin')).statusCode).toBe(
      200
    );
    expect(await isAdmin(OUTSIDE_ADMIN)).toBe(false);
    expect(setFor('admin:revoked').has(OUTSIDE_ADMIN)).toBe(false);
  });

  test('existing staff accounts keep admin access by default', async () => {
    expect(await isAdmin('new.hire@calimero.network')).toBe(true);
  });
});

describe('Fastify /api/admin/* needs a session', () => {
  let server;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  test('an admin API token is refused, a session is allowed', async () => {
    const tokenRes = await server.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: bearer('tok-staff'),
    });
    expect(tokenRes.statusCode).toBe(401);

    const sessionRes = await server.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: cookie(STAFF),
    });
    expect(sessionRes.statusCode).toBe(200);
  });

  test('another admin removes staff-domain access', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/admin/users/u-${STAFF2}`,
      headers: cookie(STAFF),
      payload: { action: 'remove_admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(await isAdmin(STAFF2)).toBe(false);
  });
});
