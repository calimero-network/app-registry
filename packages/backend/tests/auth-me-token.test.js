/**
 * GET /api/auth/me with a Bearer API token, through the real Vercel handler
 * against an in-memory Redis stand-in.
 *
 * /me must resolve tokens exactly like resolveUser does (shared verify()):
 * hashed tokens found, expiry enforced, unknown tokens fall through.
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
  del: async k => {
    const hit = store.delete(k) || sets.delete(k);
    return hit ? 1 : 0;
  },
  sMembers: async k => (sets.has(k) ? [...setFor(k)] : []),
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sRem: async (k, ...m) => (
    m.flat().forEach(x => setFor(k).delete(String(x))),
    1
  ),
  sIsMember: async (k, m) => setFor(k).has(String(m)),
  incr: async () => 1,
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

const SESSION_SECRET = 'test-session-secret';
process.env.SESSION_SECRET = SESSION_SECRET;

const meHandler = require('../../../api/auth/me');
const { apiTokens } = require('../../../api/lib/api-token-storage');
const {
  hashToken,
} = require('@calimero-network/registry-shared/api-token-storage');

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
  };
}

async function callMe(headers) {
  const res = makeRes();
  await meHandler({ method: 'GET', headers }, res);
  return res;
}

function sessionCookie(email) {
  const token = jwt.sign(
    { sub: `u-${email}`, email, name: email },
    SESSION_SECRET,
    { algorithm: 'HS256' }
  );
  return `app_registry_session=${token}`;
}

beforeEach(() => {
  store.clear();
  sets.clear();
});

describe('GET /api/auth/me with a Bearer API token', () => {
  it('resolves a newly minted (hashed) token to its user', async () => {
    const { token } = await apiTokens.create('dev@example.com', 'Dev', 'cli');
    expect(store.has(`apitoken:${token}`)).toBe(false);

    const res = await callMe({ authorization: `Bearer ${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'dev@example.com',
      email: 'dev@example.com',
      name: 'Dev',
      picture: null,
      username: null,
      verified: false,
      isAdmin: false,
    });

    // lastUsed is stamped on the hashed record, as verify() does elsewhere.
    const rec = JSON.parse(store.get(`apitoken:${hashToken(token)}`));
    expect(typeof rec.lastUsed).toBe('string');
  });

  it('does not authenticate an expired token', async () => {
    const expired = 'expired-token';
    store.set(
      `apitoken:${hashToken(expired)}`,
      JSON.stringify({ email: 'e@example.com', expiresAt: Date.now() - 1000 })
    );
    const res = await callMe({ authorization: `Bearer ${expired}` });
    expect(res.statusCode).toBe(401);
  });

  it('falls through to the session cookie for an expired token', async () => {
    const expired = 'expired-token';
    store.set(
      `apitoken:${hashToken(expired)}`,
      JSON.stringify({ email: 'e@example.com', expiresAt: Date.now() - 1000 })
    );
    const res = await callMe({
      authorization: `Bearer ${expired}`,
      cookie: sessionCookie('cookie@example.com'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('cookie@example.com');
  });

  it('falls through for an unknown token (401 without a cookie)', async () => {
    const res = await callMe({ authorization: 'Bearer nope' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');

    const withCookie = await callMe({
      authorization: 'Bearer nope',
      cookie: sessionCookie('cookie@example.com'),
    });
    expect(withCookie.statusCode).toBe(200);
    expect(withCookie.body.user.email).toBe('cookie@example.com');
  });

  it('answers 403 account_suspended for a blacklisted token owner', async () => {
    const { token } = await apiTokens.create('bad@example.com', 'Bad', 'cli');
    setFor('blacklist:set').add('bad@example.com');
    const res = await callMe({ authorization: `Bearer ${token}` });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('account_suspended');
  });
});
