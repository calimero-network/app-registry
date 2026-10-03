/**
 * Session signing and Google OAuth outside production read only the PREVIEW_
 * variables, so a non-production deployment can neither mint nor accept a
 * session signed with the production secret.
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

const meHandler = require('../../../api/auth/me');
const refreshHandler = require('../../../api/auth/refresh');
const revokeHandler = require('../../../api/auth/token/[tokenId]');
const googleHandler = require('../../../api/auth/google');
const callbackHandler = require('../../../api/auth/google/callback');
const { resolveSessionUser } = require('../../../api/lib/auth-helpers');
const { refresh } = require('../../../api/lib/refresh-storage');
const {
  refreshCookieName,
  sessionCookieName,
} = require('@calimero-network/registry-shared/session-cookies');

const PROD_SECRET = 'prod-session-secret';
const PREVIEW_SECRET = 'preview-session-secret';
const EMAIL = 'user@example.com';
const ORIGIN = 'https://apps.calimero.network';

const ENV_KEYS = [
  'VERCEL_ENV',
  'FRONTEND_URL',
  'SESSION_SECRET',
  'PREVIEW_SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'PREVIEW_GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'PREVIEW_GOOGLE_CLIENT_SECRET',
];

const PROD_VARS = {
  SESSION_SECRET: PROD_SECRET,
  GOOGLE_CLIENT_ID: 'prod-client-id',
  GOOGLE_CLIENT_SECRET: 'prod-client-secret',
};

const PREVIEW_VARS = {
  PREVIEW_SESSION_SECRET: PREVIEW_SECRET,
  PREVIEW_GOOGLE_CLIENT_ID: 'preview-client-id',
  PREVIEW_GOOGLE_CLIENT_SECRET: 'preview-client-secret',
};

let savedEnv;

function setEnv(vars) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  store.clear();
  sets.clear();
  store.set(`email2user:${EMAIL}`, 'u1');
  store.set('user:u1', JSON.stringify({ id: 'u1', email: EMAIL }));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  delete global.fetch;
  jest.restoreAllMocks();
});

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

function sessionCookieSignedWith(secret) {
  const token = jwt.sign({ sub: 'u1', email: EMAIL, name: EMAIL }, secret, {
    algorithm: 'HS256',
  });
  return `${sessionCookieName()}=${token}`;
}

function sessionFrom(res) {
  const prefix = `${sessionCookieName()}=`;
  const cookie = [].concat(res.headers['set-cookie'] || []).find(c => {
    return c.startsWith(prefix) && !c.startsWith(`${refreshCookieName()}=`);
  });
  return cookie ? cookie.slice(prefix.length).split(';')[0] : null;
}

async function me(cookie) {
  const res = makeRes();
  await meHandler({ method: 'GET', headers: { cookie } }, res);
  return res;
}

async function refreshWithIssuedToken() {
  const token = await refresh.issue(EMAIL, 'u1');
  const res = makeRes();
  await refreshHandler(
    {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        cookie: `${refreshCookieName()}=${token}`,
      },
    },
    res
  );
  return res;
}

async function revoke(cookie) {
  const res = makeRes();
  await revokeHandler(
    {
      method: 'DELETE',
      query: { tokenId: 'abc' },
      headers: { origin: ORIGIN, cookie },
    },
    res
  );
  return res;
}

async function startLogin() {
  const res = makeRes();
  await googleHandler({ method: 'GET', headers: {} }, res);
  return res;
}

function mockGoogle() {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'u1',
        email: EMAIL,
        name: EMAIL,
        verified_email: true,
      }),
    });
}

async function completeLogin() {
  const res = makeRes();
  await callbackHandler(
    {
      method: 'GET',
      query: { code: 'c', state: 'st' },
      headers: { cookie: 'oauth_state=st' },
    },
    res
  );
  return res;
}

function tokenExchangeBody() {
  return new URLSearchParams(global.fetch.mock.calls[0][1].body);
}

describe.each(['preview', 'development'])(
  'VERCEL_ENV=%s with only the production secrets',
  vercelEnv => {
    beforeEach(() => setEnv({ VERCEL_ENV: vercelEnv, ...PROD_VARS }));

    it('does not accept a session signed with SESSION_SECRET', async () => {
      const user = await resolveSessionUser({
        method: 'GET',
        headers: { cookie: sessionCookieSignedWith(PROD_SECRET) },
      });
      expect(user).toBeNull();
    });

    it('GET /api/auth/me answers 503 for a session cookie', async () => {
      const res = await me(sessionCookieSignedWith(PROD_SECRET));
      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('auth_not_configured');
    });

    it('POST /api/auth/refresh answers 503 and issues no session', async () => {
      const res = await refreshWithIssuedToken();
      expect(res.statusCode).toBe(503);
      expect(sessionFrom(res)).toBeNull();
    });

    it('token revocation refuses the session', async () => {
      const res = await revoke(sessionCookieSignedWith(PROD_SECRET));
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/auth/google answers 503', async () => {
      const res = await startLogin();
      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('auth_not_configured');
    });

    it('the OAuth callback refuses without contacting Google', async () => {
      global.fetch = jest.fn();
      const res = await completeLogin();
      expect(res.headers['location']).toContain('error=auth_not_configured');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(sessionFrom(res)).toBeNull();
    });

    it('the OAuth callback refuses when only the session secret is missing', async () => {
      setEnv({
        VERCEL_ENV: vercelEnv,
        ...PROD_VARS,
        PREVIEW_GOOGLE_CLIENT_ID: 'preview-client-id',
        PREVIEW_GOOGLE_CLIENT_SECRET: 'preview-client-secret',
      });
      global.fetch = jest.fn();
      const res = await completeLogin();
      expect(res.headers['location']).toContain('error=auth_not_configured');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  }
);

describe('VERCEL_ENV=preview with the PREVIEW_ secrets', () => {
  beforeEach(() =>
    setEnv({ VERCEL_ENV: 'preview', ...PROD_VARS, ...PREVIEW_VARS })
  );

  it('accepts a session signed with PREVIEW_SESSION_SECRET only', async () => {
    const accepted = await resolveSessionUser({
      method: 'GET',
      headers: { cookie: sessionCookieSignedWith(PREVIEW_SECRET) },
    });
    expect(accepted.email).toBe(EMAIL);
    const refused = await resolveSessionUser({
      method: 'GET',
      headers: { cookie: sessionCookieSignedWith(PROD_SECRET) },
    });
    expect(refused).toBeNull();
  });

  it('GET /api/auth/me verifies with PREVIEW_SESSION_SECRET', async () => {
    expect((await me(sessionCookieSignedWith(PREVIEW_SECRET))).statusCode).toBe(
      200
    );
    expect((await me(sessionCookieSignedWith(PROD_SECRET))).statusCode).toBe(
      401
    );
  });

  it('POST /api/auth/refresh signs with PREVIEW_SESSION_SECRET', async () => {
    const res = await refreshWithIssuedToken();
    expect(res.statusCode).toBe(200);
    const token = sessionFrom(res);
    expect(jwt.verify(token, PREVIEW_SECRET).email).toBe(EMAIL);
    expect(() => jwt.verify(token, PROD_SECRET)).toThrow();
  });

  it('GET /api/auth/google uses PREVIEW_GOOGLE_CLIENT_ID', async () => {
    const res = await startLogin();
    expect(res.statusCode).toBe(302);
    const url = new URL(res.headers['location']);
    expect(url.searchParams.get('client_id')).toBe('preview-client-id');
  });

  it('the OAuth callback uses the PREVIEW_ client and secret', async () => {
    mockGoogle();
    const res = await completeLogin();
    expect(res.headers['location']).toContain('/my-packages');
    expect(tokenExchangeBody().get('client_id')).toBe('preview-client-id');
    expect(tokenExchangeBody().get('client_secret')).toBe(
      'preview-client-secret'
    );
    const token = sessionFrom(res);
    expect(jwt.verify(token, PREVIEW_SECRET).email).toBe(EMAIL);
    expect(() => jwt.verify(token, PROD_SECRET)).toThrow();
  });
});

describe.each([
  ['VERCEL_ENV=production', { VERCEL_ENV: 'production' }],
  ['VERCEL_ENV unset', {}],
])('%s', (_label, vars) => {
  beforeEach(() => setEnv({ ...vars, ...PROD_VARS, ...PREVIEW_VARS }));

  it('accepts a session signed with SESSION_SECRET', async () => {
    const user = await resolveSessionUser({
      method: 'GET',
      headers: { cookie: sessionCookieSignedWith(PROD_SECRET) },
    });
    expect(user.email).toBe(EMAIL);
    expect((await me(sessionCookieSignedWith(PROD_SECRET))).statusCode).toBe(
      200
    );
    expect((await me(sessionCookieSignedWith(PREVIEW_SECRET))).statusCode).toBe(
      401
    );
  });

  it('POST /api/auth/refresh signs with SESSION_SECRET', async () => {
    const res = await refreshWithIssuedToken();
    expect(res.statusCode).toBe(200);
    expect(jwt.verify(sessionFrom(res), PROD_SECRET).email).toBe(EMAIL);
  });

  it('the OAuth flow uses the production client and secret', async () => {
    const start = await startLogin();
    expect(
      new URL(start.headers['location']).searchParams.get('client_id')
    ).toBe('prod-client-id');
    mockGoogle();
    const res = await completeLogin();
    expect(tokenExchangeBody().get('client_secret')).toBe('prod-client-secret');
    expect(jwt.verify(sessionFrom(res), PROD_SECRET).email).toBe(EMAIL);
  });
});
