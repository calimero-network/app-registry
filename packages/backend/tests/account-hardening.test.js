/**
 * Account + API-token lifecycle hardening, exercised through the real Vercel
 * api/ handlers against an in-memory Redis stand-in.
 *
 * These prove the security fixes are wired end to end AND that they stayed
 * backward compatible: legacy plaintext/no-expiry tokens keep resolving, and
 * existing logins are untouched.
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
  del: async k => {
    // Redis DEL removes any key type; the set index lives in `sets`.
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

const createTokenHandler = require('../../../api/auth/token');
const deleteUserHandler = require('../../../api/admin/users/[userId]');
const callbackHandler = require('../../../api/auth/google/callback');
const { resolveUser } = require('../../../api/lib/auth-helpers');
const { claimUsername } = require('../../../api/lib/user-storage');
const {
  hashToken,
} = require('@calimero-network/registry-shared/api-token-storage');

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
    redirect(loc) {
      this.headers['location'] = loc;
      this.statusCode = 302;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

function sessionCookie(email) {
  const token = jwt.sign(
    { sub: `u-${email}`, email, name: email },
    SESSION_SECRET,
    {
      algorithm: 'HS256',
    }
  );
  return `app_registry_session=${token}`;
}

beforeEach(() => {
  store.clear();
  sets.clear();
});

describe('token hashing + backward compatibility', () => {
  it('POST /api/auth/token stores the token hashed and it resolves via Bearer', async () => {
    const req = {
      method: 'POST',
      headers: { cookie: sessionCookie('victim@example.com') },
      body: { label: 'my cli' },
    };
    const res = makeRes();
    await createTokenHandler(req, res);
    expect(res.statusCode).toBe(201);
    const { token, tokenId } = res.body;

    const hash = hashToken(token);
    // Stored under the hash, never the raw value.
    expect(store.has(`apitoken:${hash}`)).toBe(true);
    expect(store.has(`apitoken:${token}`)).toBe(false);
    expect([...setFor('user_tokens:victim@example.com')]).toEqual([hash]);
    expect(tokenId).toBe(hash.slice(0, 8));

    const user = await resolveUser({
      headers: { authorization: `Bearer ${token}` },
    });
    expect(user.email).toBe('victim@example.com');
  });

  it('resolves a LEGACY plaintext token (created before hashing)', async () => {
    const legacy = 'legacy-raw-token';
    store.set(
      `apitoken:${legacy}`,
      JSON.stringify({ email: 'old@example.com', name: 'Old' }) // no expiresAt
    );
    setFor('user_tokens:old@example.com').add(legacy);

    const user = await resolveUser({
      headers: { authorization: `Bearer ${legacy}` },
    });
    expect(user.email).toBe('old@example.com');
  });

  it('rejects an expired token but accepts a no-expiry (legacy) token', async () => {
    const expired = 'expired-token';
    store.set(
      `apitoken:${hashToken(expired)}`,
      JSON.stringify({ email: 'e@example.com', expiresAt: Date.now() - 1000 })
    );
    expect(
      await resolveUser({ headers: { authorization: `Bearer ${expired}` } })
    ).toBeNull();

    const forever = 'no-expiry-token';
    store.set(
      `apitoken:${forever}`,
      JSON.stringify({ email: 'f@example.com' }) // legacy: no expiresAt
    );
    const user = await resolveUser({
      headers: { authorization: `Bearer ${forever}` },
    });
    expect(user.email).toBe('f@example.com');
  });
});

describe('revocation on user delete', () => {
  function seedUserWithTokens() {
    store.set(
      'user:U1',
      JSON.stringify({
        id: 'U1',
        email: 'victim@example.com',
        username: 'victim',
      })
    );
    store.set('email2user:victim@example.com', 'U1');
    // One new (hashed) token, one legacy (raw) token.
    const newHash = hashToken('new');
    store.set(
      `apitoken:${newHash}`,
      JSON.stringify({
        email: 'victim@example.com',
        expiresAt: Date.now() + 1e9,
      })
    );
    store.set(
      'apitoken:legacyraw',
      JSON.stringify({ email: 'victim@example.com' })
    );
    setFor('user_tokens:victim@example.com').add(newHash);
    setFor('user_tokens:victim@example.com').add('legacyraw');
    return { newHash };
  }

  it('DELETE revokes every API token and tombstones the username', async () => {
    const { newHash } = seedUserWithTokens();
    const req = {
      method: 'DELETE',
      query: { userId: 'U1' },
      headers: { cookie: sessionCookie('admin@calimero.network') },
      body: {},
    };
    const res = makeRes();
    await deleteUserHandler(req, res);
    expect(res.statusCode).toBe(204);

    // Tokens and the index set are gone.
    expect(store.has(`apitoken:${newHash}`)).toBe(false);
    expect(store.has('apitoken:legacyraw')).toBe(false);
    expect([...setFor('user_tokens:victim@example.com')]).toEqual([]);
    expect(store.has('user:U1')).toBe(false);

    // Username is tombstoned, not freed.
    expect(store.get('username:victim')).toBe('retired:deleted-user');

    // And it cannot be re-claimed.
    store.set(
      'user:U2',
      JSON.stringify({ id: 'U2', email: 'new@example.com' })
    );
    await expect(claimUsername('U2', 'victim')).rejects.toMatchObject({
      code: 'retired',
    });
  });

  it('blacklist action also revokes the user API tokens', async () => {
    const { newHash } = seedUserWithTokens();
    const req = {
      method: 'PATCH',
      query: { userId: 'U1' },
      headers: { cookie: sessionCookie('admin@calimero.network') },
      body: { action: 'blacklist', reason: 'abuse' },
    };
    const res = makeRes();
    await deleteUserHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(store.has(`apitoken:${newHash}`)).toBe(false);
    expect(store.has('apitoken:legacyraw')).toBe(false);
    expect([...setFor('user_tokens:victim@example.com')]).toEqual([]);
  });
});

describe('verified Google email is required', () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.FRONTEND_URL = 'https://apps.example.com';
  });
  afterEach(() => {
    process.env = { ...OLD_ENV, SESSION_SECRET };
    delete global.fetch;
  });

  function mockGoogle(profile) {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'a' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => profile });
  }

  function callbackReq() {
    return {
      method: 'GET',
      query: { code: 'c', state: 'st' },
      headers: { cookie: 'oauth_state=st' },
    };
  }

  it('rejects a login when verified_email is false', async () => {
    mockGoogle({ id: 'g1', email: 'x@example.com', verified_email: false });
    const res = makeRes();
    await callbackHandler(callbackReq(), res);
    expect(res.headers['location']).toContain('error=email_unverified');
  });

  it('rejects a login when verified_email is missing', async () => {
    mockGoogle({ id: 'g1', email: 'x@example.com' });
    const res = makeRes();
    await callbackHandler(callbackReq(), res);
    expect(res.headers['location']).toContain('error=email_unverified');
  });

  it('accepts a login when verified_email is true', async () => {
    mockGoogle({ id: 'g1', email: 'x@example.com', verified_email: true });
    const res = makeRes();
    await callbackHandler(callbackReq(), res);
    expect(res.headers['location']).toContain('/my-packages');
  });
});
