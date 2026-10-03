const jwt = require('jsonwebtoken');

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => (store.delete(k) || sets.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async (k, ...m) => {
    if (!sets.has(k)) return 0;
    let n = 0;
    m.flat().forEach(x => {
      if (sets.get(k).delete(String(x))) n++;
    });
    return n;
  },
  sIsMember: async (k, m) => (sets.has(k) ? sets.get(k).has(String(m)) : false),
  hGetAll: async k => (hashes.has(k) ? { ...hashes.get(k) } : {}),
  hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
  hSet: async (k, obj) => {
    if (!hashes.has(k)) hashes.set(k, {});
    Object.assign(hashes.get(k), obj);
    return Object.keys(obj).length;
  },
  hDel: async (k, f) => {
    if (!hashes.has(k) || !(f in hashes.get(k))) return 0;
    delete hashes.get(k)[f];
    return 1;
  },
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

const orgsHandler = require('../../../api/v2/orgs/index');
const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const createTokenHandler = require('../../../api/auth/token');
const revokeTokenHandler = require('../../../api/auth/token/[tokenId]');
const logoutHandler = require('../../../api/auth/logout');
const refreshHandler = require('../../../api/auth/refresh');
const {
  isSameOriginRequest,
  isCrossOriginCookieWrite,
  requestOrigin,
} = require('../../../api/lib/request-origin');

const REGISTRY = 'https://apps.calimero.network';
const SIBLING = 'https://evil.calimero.network';
const EMAIL = 'publisher@example.com';
const TOKEN = 'cli-token';

const ENV_KEYS = [
  'FRONTEND_URL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
];
const savedEnv = {};

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

function sessionCookie(email = EMAIL) {
  store.set(`email2user:${email}`, `u-${email}`);
  store.set(`user:u-${email}`, JSON.stringify({ id: `u-${email}`, email }));
  const token = jwt.sign(
    { sub: `u-${email}`, email, name: email },
    SESSION_SECRET,
    { algorithm: 'HS256' }
  );
  return `app_registry_session=${token}`;
}

async function call(handler, req) {
  const res = makeRes();
  await handler({ query: {}, ...req, headers: req.headers || {} }, res);
  return res;
}

function createOrg(headers, slug = 'acme') {
  return call(orgsHandler, {
    method: 'POST',
    headers,
    body: { name: 'Acme', slug },
  });
}

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => {
  store.clear();
  sets.clear();
  hashes.clear();
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.VERCEL_ENV = 'production';
  store.set(`apitoken:${TOKEN}`, JSON.stringify({ email: EMAIL, name: EMAIL }));
  sessionCookie();
});

describe('cookie-authenticated writes through requireAuth', () => {
  test('a foreign Origin is refused with 403 and nothing is written', async () => {
    const res = await createOrg({ cookie: sessionCookie(), origin: SIBLING });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_origin');
    expect(store.has('org:acme')).toBe(false);
  });

  test('the registry Origin is accepted', async () => {
    const res = await createOrg({ cookie: sessionCookie(), origin: REGISTRY });
    expect(res.statusCode).toBe(201);
    expect(store.has('org:acme')).toBe(true);
  });

  test('a missing Origin and Referer is refused with 403', async () => {
    const res = await createOrg({ cookie: sessionCookie() });
    expect(res.statusCode).toBe(403);
    expect(store.has('org:acme')).toBe(false);
  });

  test('a same-origin Referer stands in for a missing Origin', async () => {
    const res = await createOrg({
      cookie: sessionCookie(),
      referer: `${REGISTRY}/orgs/new`,
    });
    expect(res.statusCode).toBe(201);
  });

  test('a foreign Referer without Origin is refused', async () => {
    const res = await createOrg({
      cookie: sessionCookie(),
      referer: `${SIBLING}/page`,
    });
    expect(res.statusCode).toBe(403);
  });

  test('an opaque "null" Origin is refused', async () => {
    const res = await createOrg({ cookie: sessionCookie(), origin: 'null' });
    expect(res.statusCode).toBe(403);
  });

  test('a Bearer token needs no Origin', async () => {
    const res = await createOrg({ authorization: `Bearer ${TOKEN}` });
    expect(res.statusCode).toBe(201);
  });

  test('a Bearer token is accepted alongside a cookie from any Origin', async () => {
    const res = await createOrg({
      authorization: `Bearer ${TOKEN}`,
      cookie: sessionCookie(),
      origin: SIBLING,
    });
    expect(res.statusCode).toBe(201);
  });

  test('no credentials at all is still a 401', async () => {
    const res = await createOrg({ origin: SIBLING });
    expect(res.statusCode).toBe(401);
  });

  test('reads are not origin-checked', async () => {
    const res = await call(orgsHandler, {
      method: 'GET',
      headers: { cookie: sessionCookie(), origin: SIBLING },
    });
    expect(res.statusCode).not.toBe(403);
  });
});

describe('publish routes', () => {
  test('push with a Bearer token and no Origin gets past authentication', async () => {
    const res = await call(pushHandler, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_manifest');
  });

  test('push with a cookie from a foreign Origin is refused', async () => {
    const res = await call(pushHandler, {
      method: 'POST',
      headers: { cookie: sessionCookie(), origin: SIBLING },
      body: { package: 'com.example.app', appVersion: '1.0.0' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_origin');
  });

  test('push-file with a cookie from a foreign Origin is refused before the upload is read', async () => {
    const res = await call(pushFileHandler, {
      method: 'POST',
      headers: {
        cookie: sessionCookie(),
        origin: SIBLING,
        'content-type': 'multipart/form-data; boundary=x',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_origin');
  });
});

describe('session-only auth routes', () => {
  test('minting a token from a foreign Origin is refused', async () => {
    const res = await call(createTokenHandler, {
      method: 'POST',
      headers: { cookie: sessionCookie(), origin: SIBLING },
      body: { label: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  test('minting a token from the registry Origin works', async () => {
    const res = await call(createTokenHandler, {
      method: 'POST',
      headers: { cookie: sessionCookie(), origin: REGISTRY },
      body: { label: 'x' },
    });
    expect(res.statusCode).toBe(201);
  });

  test('revoking a token from a foreign Origin is refused', async () => {
    sets.set(`user_tokens:${EMAIL}`, new Set([TOKEN]));
    const res = await call(revokeTokenHandler, {
      method: 'DELETE',
      query: { tokenId: TOKEN },
      headers: { cookie: sessionCookie(), origin: SIBLING },
    });
    expect(res.statusCode).toBe(403);
    expect(store.has(`apitoken:${TOKEN}`)).toBe(true);
  });

  test('revoking a token from the registry Origin works', async () => {
    sets.set(`user_tokens:${EMAIL}`, new Set([TOKEN]));
    const res = await call(revokeTokenHandler, {
      method: 'DELETE',
      query: { tokenId: TOKEN.slice(0, 8) },
      headers: { cookie: sessionCookie(), origin: REGISTRY },
    });
    expect(res.statusCode).toBe(204);
  });

  test('logout and refresh from a foreign Origin are refused', async () => {
    const headers = {
      cookie: 'app_registry_session_refresh=abc',
      origin: SIBLING,
    };
    const out = await call(logoutHandler, { method: 'POST', headers });
    expect(out.statusCode).toBe(403);
    const ref = await call(refreshHandler, { method: 'POST', headers });
    expect(ref.statusCode).toBe(403);
  });

  test('refresh from the registry Origin reaches the token check', async () => {
    const res = await call(refreshHandler, {
      method: 'POST',
      headers: { origin: REGISTRY },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('no_refresh_token');
  });
});

describe('allowed origins', () => {
  const post = headers => ({
    method: 'POST',
    headers: { cookie: sessionCookie(), ...headers },
  });

  test('FRONTEND_URL is the registry origin', () => {
    process.env.FRONTEND_URL = 'https://registry.example.org/';
    expect(
      isSameOriginRequest(post({ origin: 'https://registry.example.org' }))
    ).toBe(true);
    expect(isSameOriginRequest(post({ origin: REGISTRY }))).toBe(false);
  });

  test('the deployment host itself is same-origin', () => {
    expect(
      isSameOriginRequest(
        post({
          host: 'app-registry-git-x.vercel.app',
          origin: 'https://app-registry-git-x.vercel.app',
        })
      )
    ).toBe(true);
  });

  test('VERCEL_URL is accepted', () => {
    process.env.VERCEL_URL = 'app-registry-abc.vercel.app';
    expect(
      isSameOriginRequest(
        post({ origin: 'https://app-registry-abc.vercel.app' })
      )
    ).toBe(true);
  });

  test('scheme and port must match exactly', () => {
    expect(
      isSameOriginRequest(post({ origin: 'http://apps.calimero.network' }))
    ).toBe(false);
    expect(
      isSameOriginRequest(
        post({ origin: 'https://apps.calimero.network:8443' })
      )
    ).toBe(false);
    expect(
      isSameOriginRequest(
        post({ origin: 'https://apps.calimero.network.evil.io' })
      )
    ).toBe(false);
  });

  test('localhost is accepted only outside a Vercel deployment', () => {
    const req = post({ origin: 'http://localhost:3000' });
    expect(isSameOriginRequest(req)).toBe(false);
    process.env.VERCEL_ENV = 'preview';
    expect(isSameOriginRequest(req)).toBe(false);
    delete process.env.VERCEL_ENV;
    expect(isSameOriginRequest(req)).toBe(true);
    process.env.VERCEL_ENV = 'development';
    expect(isSameOriginRequest(post({ origin: 'http://127.0.0.1:5173' }))).toBe(
      true
    );
  });

  test('Origin takes precedence over Referer', () => {
    expect(
      requestOrigin({ headers: { origin: SIBLING, referer: `${REGISTRY}/x` } })
    ).toBe(SIBLING);
  });

  test('requests without an auth cookie are never flagged', () => {
    expect(
      isCrossOriginCookieWrite({ method: 'POST', headers: { origin: SIBLING } })
    ).toBe(false);
  });
});
