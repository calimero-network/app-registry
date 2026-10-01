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
const { refresh } = require('../../../api/lib/refresh-storage');
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

const SAME_ORIGIN = 'https://apps.calimero.network';
function seedProfile(email) {
  const key = `email2user:${email}`;
  if (store.has(key)) return;
  store.set(key, `u-${email}`);
  store.set(`user:u-${email}`, JSON.stringify({ id: `u-${email}`, email }));
}

function sessionCookie(email) {
  seedProfile(email);
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
      headers: {
        cookie: sessionCookie('victim@example.com'),
        origin: SAME_ORIGIN,
      },
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

describe('session cookies require a live profile', () => {
  it('resolves a session whose profile exists', async () => {
    const cookie = sessionCookie('live@example.com');
    const user = await resolveUser({ headers: { cookie } });
    expect(user).toMatchObject({ email: 'live@example.com' });
  });

  it('refuses a still-valid session once the profile is deleted', async () => {
    const cookie = sessionCookie('deleted@example.com');
    store.delete('email2user:deleted@example.com');
    store.delete('user:u-deleted@example.com');
    expect(await resolveUser({ headers: { cookie } })).toBeNull();

    const res = makeRes();
    await createTokenHandler(
      { method: 'POST', headers: { cookie, origin: SAME_ORIGIN }, body: {} },
      res
    );
    expect(res.statusCode).toBe(401);
  });
});

describe('minting API tokens requires a session', () => {
  function mintReq(headers) {
    return {
      method: 'POST',
      headers: { origin: SAME_ORIGIN, ...headers },
      body: { label: 'x' },
    };
  }

  it('refuses a Bearer API token as the credential for minting another', async () => {
    const existing = 'existing-token';
    store.set(
      `apitoken:${hashToken(existing)}`,
      JSON.stringify({
        email: 'dev@example.com',
        name: 'Dev',
        expiresAt: Date.now() + 1e9,
      })
    );
    setFor('user_tokens:dev@example.com').add(hashToken(existing));

    const res = makeRes();
    await createTokenHandler(
      mintReq({ authorization: `Bearer ${existing}` }),
      res
    );
    expect(res.statusCode).toBe(401);
    // Nothing new was written for the account.
    expect([...setFor('user_tokens:dev@example.com')]).toEqual([
      hashToken(existing),
    ]);
  });

  it('refuses a bot account even with a valid session', async () => {
    setFor('bot:set').add('ci@example.com');
    const res = makeRes();
    await createTokenHandler(
      mintReq({ cookie: sessionCookie('ci@example.com') }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('bot_forbidden');
    expect([...setFor('user_tokens:ci@example.com')]).toEqual([]);
  });

  it('refuses a suspended account with a still-valid session', async () => {
    setFor('blacklist:set').add('gone@example.com');
    const res = makeRes();
    await createTokenHandler(
      mintReq({ cookie: sessionCookie('gone@example.com') }),
      res
    );
    expect(res.statusCode).toBe(401);
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
      headers: {
        cookie: sessionCookie('admin@calimero.network'),
        origin: SAME_ORIGIN,
      },
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
      headers: {
        cookie: sessionCookie('admin@calimero.network'),
        origin: SAME_ORIGIN,
      },
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

describe('suspending and revoking any account', () => {
  const STAFF = 'departed@calimero.network';
  const ADMIN = 'admin@calimero.network';

  async function seedStaff() {
    store.set(
      'user:S1',
      JSON.stringify({ id: 'S1', email: STAFF, username: 'departed' })
    );
    store.set(`email2user:${STAFF}`, 'S1');
    const apiHash = hashToken('staff-token');
    store.set(
      `apitoken:${apiHash}`,
      JSON.stringify({ email: STAFF, expiresAt: Date.now() + 1e9 })
    );
    setFor(`user_tokens:${STAFF}`).add(apiHash);
    const refreshToken = await refresh.issue(STAFF, 'S1');
    return { apiHash, refreshToken };
  }

  function patch(action, asEmail = ADMIN) {
    return {
      method: 'PATCH',
      query: { userId: 'S1' },
      headers: { cookie: sessionCookie(asEmail), origin: SAME_ORIGIN },
      body: { action, reason: 'offboarded' },
    };
  }

  it('blacklists a @calimero.network account and ends its credentials', async () => {
    const { apiHash, refreshToken } = await seedStaff();
    const res = makeRes();
    await deleteUserHandler(patch('blacklist'), res);
    expect(res.statusCode).toBe(200);
    expect(setFor('blacklist:set').has(STAFF)).toBe(true);
    expect(store.has(`apitoken:${apiHash}`)).toBe(false);
    expect(await refresh.verify(refreshToken)).toBeNull();
    // Neither a Bearer token nor a still-signed session resolves any more.
    expect(
      await resolveUser({ headers: { authorization: 'Bearer staff-token' } })
    ).toBeNull();
    expect(
      await resolveUser({ headers: { cookie: sessionCookie(STAFF) } })
    ).toBeNull();
  });

  it('refuses to blacklist the acting admin', async () => {
    store.set(
      'user:S1',
      JSON.stringify({ id: 'S1', email: ADMIN, username: 'admin' })
    );
    const res = makeRes();
    await deleteUserHandler(patch('blacklist'), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('cannot_blacklist_self');
    expect(setFor('blacklist:set').has(ADMIN)).toBe(false);
  });

  it('revoke_tokens ends API tokens and sessions but keeps the account', async () => {
    const { apiHash, refreshToken } = await seedStaff();
    const res = makeRes();
    await deleteUserHandler(patch('revoke_tokens'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.revoked).toEqual({ apiTokens: 1, refreshTokens: 1 });
    expect(store.has(`apitoken:${apiHash}`)).toBe(false);
    expect([...setFor(`user_tokens:${STAFF}`)]).toEqual([]);
    expect(await refresh.verify(refreshToken)).toBeNull();
    // The profile stays and the account is not suspended.
    expect(store.has('user:S1')).toBe(true);
    expect(setFor('blacklist:set').has(STAFF)).toBe(false);
  });

  it('revoke_tokens is admin-only', async () => {
    await seedStaff();
    const res = makeRes();
    await deleteUserHandler(patch('revoke_tokens', 'someone@example.com'), res);
    expect(res.statusCode).toBe(403);
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
