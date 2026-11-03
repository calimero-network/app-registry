/**
 * Calimero Cloud private packages, end to end on the production (Vercel)
 * handlers: real Cloud JWT verification against a JWKS served over HTTP,
 * real Ed25519 bundle signatures, real bundle storage over an in-memory
 * Redis, and the node download path over a real HTTP socket with basic auth
 * checked by a stand-in Cloud manager that verifies the HMAC.
 *
 * Contract: docs/cloud-integration.md.
 */

const http = require('http');
const crypto = require('crypto');
const { Readable: MockReadable } = require('stream');
const jose = require('jose');
const jwt = require('jsonwebtoken');
const { createMemoryKv } = require('./helpers/memory-kv');

const mockKv = createMemoryKv();
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

// api/v2/bundles/[package]/[version].js opens its own Redis client for GET
// (an empty Map unless REDIS_URL is set); route it to the same store.
jest.mock('redis', () => ({
  createClient: () => ({
    on() {},
    connect: async () => {},
    get: k => mockKv.get(k),
  }),
}));

const mockBlobs = new Map();
jest.mock('../src/lib/blob-store', () => ({
  MAX_BUNDLE_BYTES: 50 * 1024 * 1024,
  putBinary: jest.fn(async (key, buf) => {
    mockBlobs.set(key, Buffer.from(buf));
    return '1';
  }),
  getBinary: jest.fn(async key => mockBlobs.get(key) || null),
  openBinaryStream: jest.fn(async key => {
    const buf = mockBlobs.get(key);
    if (!buf) return null;
    // Two chunks, so the response really is streamed rather than sent whole.
    const mid = Math.floor(buf.length / 2);
    return {
      stream: MockReadable.from([buf.subarray(0, mid), buf.subarray(mid)]),
      size: buf.length,
      generation: '1',
    };
  }),
  deleteBinary: jest.fn(async key => {
    mockBlobs.delete(key);
  }),
  getUpload: jest.fn(async () => null),
  deleteUpload: jest.fn(async () => {}),
  signedUploadUrl: jest.fn(async () => ({ url: 'https://upload.test' })),
}));

const mockAdmins = new Set();
const mockAdminStorage = () => ({
  isAdmin: async email => mockAdmins.has(email),
  isBot: async () => false,
  isBlacklisted: async () => false,
  setAdminVerified: async () => {},
});
const mockUserStorage = () => ({
  getUserByEmail: async email => ({
    id: `u-${email}`,
    email,
    username: String(email).split('@')[0],
  }),
});
jest.mock('../../../api/lib/admin-storage', () => mockAdminStorage());
jest.mock('../src/lib/admin-storage', () => mockAdminStorage());
jest.mock('../../../api/lib/user-storage', () => mockUserStorage());
jest.mock('../src/lib/user-storage', () => mockUserStorage());

const { TEST_ICON } = require('./helpers/publishable');
const { generateKeypair, signBundle } = require('./helpers/ed25519-helper');

const ISSUER = 'https://cloud.calimero.network';
const ORG_A = 'org_acme';
const ORG_B = 'org_globex';
const HMAC_SECRET = 'test-hmac-secret';
const SESSION_SECRET = 'test-session-secret';
const SITE = 'https://apps.calimero.network';

let jwksServer;
let mdmaServer;
let registryServer;
let registryUrl;
let edKey;
let rsKey;
let strayKey;
const mdma = { calls: 0, down: false, badSig: 0, published: [], orgs: [] };
// cluster credentials the stand-in Cloud manager knows: user -> {token, org}
const CLUSTERS = {
  'cluster-a': { token: 'tok-a', org: ORG_A },
  'cluster-b': { token: 'tok-b', org: ORG_B },
};

function listen(server) {
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  );
}

/** Vercel's res helpers over a plain Node response. */
function vercelify(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = obj => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = body => {
    res.end(body);
    return res;
  };
  return res;
}

beforeAll(async () => {
  const ed = await jose.generateKeyPair('EdDSA', { extractable: true });
  const rs = await jose.generateKeyPair('RS256', { extractable: true });
  const stray = await jose.generateKeyPair('EdDSA', { extractable: true });
  edKey = { ...ed, kid: 'ed-1', alg: 'EdDSA' };
  rsKey = { ...rs, kid: 'rs-1', alg: 'RS256' };
  strayKey = { ...stray, kid: 'stray', alg: 'EdDSA' };
  const keys = [
    { ...(await jose.exportJWK(ed.publicKey)), kid: 'ed-1', alg: 'EdDSA' },
    { ...(await jose.exportJWK(rs.publicKey)), kid: 'rs-1', alg: 'RS256' },
  ];
  jwksServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys }));
  });
  const jwksPort = await listen(jwksServer);

  mdmaServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      // mdma's scheme: sha256=<hex HMAC(secret, "{ts}.{body}")>, ts within 5 min.
      const ts = req.headers['x-registry-timestamp'];
      const mac = crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(`${ts}.${raw}`)
        .digest('hex');
      const expected = `sha256=${mac}`;
      const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
      const signed = req.headers['x-registry-signature'] === expected && fresh;
      if (req.url === '/internal/registry/published') {
        if (!signed) {
          mdma.badSig++;
          res.statusCode = 401;
          return res.end();
        }
        mdma.published.push(JSON.parse(raw));
        res.statusCode = 204;
        return res.end();
      }
      mdma.calls++;
      if (mdma.down) {
        res.statusCode = 502;
        return res.end();
      }
      if (!signed) {
        mdma.badSig++;
        res.statusCode = 401;
        return res.end();
      }
      const body = JSON.parse(raw);
      mdma.orgs.push(body.org);
      const cluster = CLUSTERS[body.cluster_user];
      const allowed = !!cluster && cluster.token === body.token;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ allowed, org_id: allowed ? cluster.org : null })
      );
    });
  });
  const mdmaPort = await listen(mdmaServer);

  process.env.CLOUD_JWKS_URL = `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`;
  process.env.CLOUD_ISSUER = ISSUER;
  process.env.CLOUD_AUTHORIZE_URL = `http://127.0.0.1:${mdmaPort}/internal/registry/authorize`;
  process.env.CLOUD_AUTHORIZE_HMAC_SECRET = HMAC_SECRET;
  process.env.SESSION_SECRET = SESSION_SECRET;

  const artifactHandler = require('../../../api/artifacts/[package]/[version]/[filename]');
  registryServer = http.createServer((req, res) => {
    req.query = {};
    artifactHandler(req, vercelify(res)).catch(err => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });
  registryUrl = `http://127.0.0.1:${await listen(registryServer)}`;
});

afterAll(async () => {
  for (const s of [jwksServer, mdmaServer, registryServer]) {
    await new Promise(r => s.close(r));
  }
  for (const k of [
    'CLOUD_JWKS_URL',
    'CLOUD_ISSUER',
    'CLOUD_AUTHORIZE_URL',
    'CLOUD_AUTHORIZE_HMAC_SECRET',
    'SESSION_SECRET',
    'CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE',
    'CLOUD_QUOTA_MAX_BUNDLE_BYTES',
  ]) {
    delete process.env[k];
  }
});

const auth = require('../../../api/lib/auth-helpers');
const { _clearAuthorizeCache } = require('../../../api/lib/cloud-authorize');
const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const {
  manifestDigest,
  MANIFEST_SIGNING_DOMAIN,
} = require('../../../api/lib/package-records');
const verifyLib = require('../../../api/lib/verify');
const listHandler = require('../../../api/v2/bundles/index');
const versionHandler = require('../../../api/v2/bundles/[package]/[version]');
const packageHandler = require('../../../api/v2/packages/[package]/index');
const visibilityHandler = require('../../../api/v2/packages/[package]/visibility');
const yankHandler = require('../../../api/v2/bundles/[package]/[version]/yank');
const deleteHandler = require('../../../api/v2/bundles/[package]');
const auditHandler = require('../../../api/v2/orgs/[orgId]/audit');
const adminPackageHandler = require('../../../api/admin/packages/[packageName]');
const reviewQueueHandler = require('../../../api/admin/review-queue');
const { apiTokens } = require('../../../api/lib/api-token-storage');

async function mint(
  claims = {},
  { key = edKey, ttl = 300, iss = ISSUER, aud = 'registry' } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    org: ORG_A,
    org_slug: 'acme',
    role: 'admin',
    scope: 'publish',
    ...claims,
  })
    .setProtectedHeader({ alg: key.alg, kid: key.kid })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(claims.sub || 'dev@acme.io')
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(key.privateKey);
}

const bearer = token => ({ authorization: `Bearer ${token}` });

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end() {
      if (this.statusCode === null) this.statusCode = 200;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

async function call(
  handler,
  { method = 'GET', headers = {}, query = {}, body } = {}
) {
  const res = makeRes();
  await handler({ method, headers, query, body, url: '/' }, res);
  return res;
}

function manifestFor(pkg, version) {
  return {
    version: '1.0',
    package: pkg,
    appVersion: version,
    metadata: {
      name: `App ${pkg}`,
      description: 'A test app for Cloud private packages publishing.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
  };
}

async function publish(pkg, version, { keys, headers, extra = {} } = {}) {
  const bundle = await signBundle(manifestFor(pkg, version), keys);
  return call(pushHandler, {
    method: 'POST',
    headers,
    body: { ...bundle, ...extra },
  });
}

async function legacyToken(email) {
  const { token } = await apiTokens.create(email, email, 'test');
  return token;
}

function sessionCookie(email) {
  const token = jwt.sign({ sub: `u-${email}`, email }, SESSION_SECRET, {
    algorithm: 'HS256',
  });
  return { cookie: `app_registry_session=${token}`, origin: SITE };
}

function download(pkg, version, { user, pass, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${registryUrl}/artifacts/${pkg}/${version}/${pkg}-${version}.mpk`,
      {
        method: 'GET',
        // `auth` is exactly what a URL's userinfo becomes: Basic auth.
        ...(user ? { auth: `${user}:${pass}` } : {}),
        headers,
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

let keysA;
let keysOther;
beforeEach(async () => {
  mockKv.clear();
  mockBlobs.clear();
  mockAdmins.clear();
  _clearAuthorizeCache();
  Object.assign(mdma, {
    calls: 0,
    down: false,
    badSig: 0,
    published: [],
    orgs: [],
  });
  delete process.env.CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE;
  delete process.env.CLOUD_QUOTA_MAX_BUNDLE_BYTES;
  keysA = await generateKeypair();
  keysOther = await generateKeypair();
});

describe('resolveCloudJwt', () => {
  const req = token => ({ headers: bearer(token) });

  test('accepts EdDSA and RS256 tokens from the JWKS', async () => {
    const ed = await auth.resolveCloudJwt(req(await mint()));
    expect(ed).toMatchObject({
      email: 'dev@acme.io',
      cloud: true,
      cloudOrgId: ORG_A,
      orgSlug: 'acme',
      role: 'admin',
      scopes: ['publish', 'read'],
    });
    const rs = await auth.resolveCloudJwt(
      req(await mint({ scope: 'read' }, { key: rsKey }))
    );
    expect(rs).toMatchObject({ scopes: ['read'] });
  });

  test.each([
    ['a foreign issuer', {}, { iss: 'https://evil.example' }],
    ['another audience', {}, { aud: 'console' }],
    ['an expired token', {}, { ttl: -120 }],
    ['a long-lived token', {}, { ttl: 24 * 3600 }],
    ['a key not in the JWKS', {}, { key: null }],
    ['no usable scope', { scope: 'admin' }, {}],
  ])('rejects %s', async (_label, claims, opts) => {
    const o = { ...opts };
    if (o.key === null) o.key = strayKey;
    expect(await auth.resolveCloudJwt(req(await mint(claims, o)))).toBeNull();
  });

  test('a non-email subject is namespaced, never an account email', async () => {
    const u = await auth.resolveCloudJwt(req(await mint({ sub: 'usr_42' })));
    expect(u.email).toBe('cloud:usr_42');
  });

  test('resolveUser ignores a Cloud JWT unless the handler opts in', async () => {
    const token = await mint();
    expect(await auth.resolveUser(req(token))).toBeNull();
    expect(
      await auth.resolveUser(req(token), { allowCloud: true })
    ).toMatchObject({ cloud: true });
  });

  test('legacy API tokens still resolve', async () => {
    const token = await legacyToken('legacy@example.com');
    expect(
      await auth.resolveUser({ headers: bearer(token) }, { allowCloud: true })
    ).toMatchObject({ email: 'legacy@example.com' });
  });
});

describe('publishing', () => {
  test('a Cloud publish is private by default and claims the namespace', async () => {
    const res = await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.visibility).toBe('private');

    const record = JSON.parse(mockKv.store.get('pkg:com.acme.app'));
    expect(record).toMatchObject({
      org_id: `cloud-${ORG_A}`,
      visibility: 'private',
      owner_email: 'dev@acme.io',
    });
    expect(record.signer_id).toBe(
      Buffer.from(keysA.publicKey).toString('base64url')
    );
    expect(mockKv.store.get('ns:com.acme')).toBe(`cloud-${ORG_A}`);
    expect(mockKv.store.get('pkg2org:com.acme.app')).toBe(`cloud-${ORG_A}`);
    const org = JSON.parse(mockKv.store.get(`org:cloud-${ORG_A}`));
    expect(org).toMatchObject({ cloud_org_id: ORG_A, slug: 'acme' });
    // Transient field never reaches the stored manifest.
    expect(mockKv.store.get('bundle:com.acme.app/1.0.0')).not.toMatch(
      /_visibility/
    );
  });

  test('visibility can be chosen with _visibility or the header', async () => {
    const a = await publish('com.acme.one', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
      extra: { _visibility: 'public' },
    });
    expect(a.body.visibility).toBe('public');
    const b = await publish('com.acme.two', '1.0.0', {
      keys: keysA,
      headers: {
        ...bearer(await mint()),
        'x-registry-visibility': 'public',
      },
    });
    expect(b.body.visibility).toBe('public');
    const bad = await publish('com.acme.three', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
      extra: { _visibility: 'secret' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toBe('invalid_visibility');
  });

  test('a read-only token cannot publish', async () => {
    const res = await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint({ scope: 'read' })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });

  test('another org cannot publish into a claimed namespace', async () => {
    await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    const res = await publish('com.acme.other', '1.0.0', {
      keys: keysOther,
      headers: bearer(await mint({ org: ORG_B, org_slug: 'globex' })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'namespace_owned',
      namespace: 'com.acme',
    });
  });

  test('a registry account outside the org cannot either', async () => {
    await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    const res = await publish('com.acme.legacy', '1.0.0', {
      keys: keysOther,
      headers: bearer(await legacyToken('someone@example.com')),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('namespace_owned');
  });

  test('a registry publish stays public and gets a record', async () => {
    const res = await publish('org.example.tool', '1.0.0', {
      keys: keysA,
      headers: bearer(await legacyToken('dev@example.org')),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.visibility).toBe('public');
    expect(JSON.parse(mockKv.store.get('pkg:org.example.tool'))).toMatchObject({
      visibility: 'public',
      org_id: null,
    });
    // Registry publishes never claim namespaces.
    expect(mockKv.store.has('ns:org.example')).toBe(false);
  });

  test('a namespace already used by someone else cannot be claimed', async () => {
    await publish('com.initech.legacy', '1.0.0', {
      keys: keysOther,
      headers: bearer(await legacyToken('old@initech.com')),
    });
    const res = await publish('com.initech.cloud', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('namespace_conflict');
    expect(mockKv.store.has('ns:com.initech')).toBe(false);
  });

  test('a new version must carry the pinned signer', async () => {
    const headers = bearer(await mint());
    await publish('com.acme.app', '1.0.0', { keys: keysA, headers });
    const wrong = await publish('com.acme.app', '1.1.0', {
      keys: keysOther,
      headers,
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.body.error).toBe('signer_mismatch');
    const right = await publish('com.acme.app', '1.1.0', {
      keys: keysA,
      headers,
    });
    expect(right.statusCode).toBe(201);
    expect(right.body.visibility).toBe('private');
  });

  test("another Cloud org cannot publish a version of this org's package", async () => {
    await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    const res = await publish('com.acme.app', '2.0.0', {
      keys: keysA,
      headers: bearer(await mint({ org: ORG_B })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('not_owner');
  });

  test('reserved prefixes stay reserved, whatever email the token names', async () => {
    const res = await publish('com.calimero.sneaky', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint({ sub: 'staff@calimero.network' })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('reserved_prefix');
  });

  test('per-org quotas: versions and bundle size', async () => {
    const headers = bearer(await mint());
    process.env.CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE = '1';
    expect(
      (await publish('com.acme.app', '1.0.0', { keys: keysA, headers }))
        .statusCode
    ).toBe(201);
    const second = await publish('com.acme.app', '1.1.0', {
      keys: keysA,
      headers,
    });
    expect(second.statusCode).toBe(413);
    expect(second.body.error).toBe('quota_exceeded');

    process.env.CLOUD_QUOTA_MAX_BUNDLE_BYTES = '10';
    const big = await publish('com.acme.big', '1.0.0', {
      keys: keysA,
      headers,
    });
    expect(big.statusCode).toBe(413);
    expect(big.body.limit).toEqual({ max_bundle_bytes: 10 });
    // A refused first publish claims nothing new and stores nothing.
    expect(mockKv.store.has('pkg:com.acme.big')).toBe(false);
  });

  test('an org quota override beats the default', async () => {
    const headers = bearer(await mint());
    await publish('com.acme.app', '1.0.0', { keys: keysA, headers });
    const key = `org:cloud-${ORG_A}`;
    const org = JSON.parse(mockKv.store.get(key));
    mockKv.store.set(
      key,
      JSON.stringify({ ...org, quotas: { max_total_bytes: 1 } })
    );
    const res = await publish('com.acme.app', '1.0.1', {
      keys: keysA,
      headers,
    });
    expect(res.statusCode).toBe(413);
    expect(res.body.limit).toMatchObject({ max_total_bytes: 1 });
  });
});

describe('Cloud manager notifications and push-file', () => {
  /** multipart/form-data with the .mpk in field `bundle`, as mdma sends it. */
  function multipartReq(mpk, headers) {
    const boundary = '----registrytest';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="app.mpk"\r\nContent-Type: application/gzip\r\n\r\n`
      ),
      mpk,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = MockReadable.from([body]);
    req.method = 'POST';
    req.query = {};
    req.headers = {
      ...headers,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    };
    return req;
  }

  test('the signing domain matches the verifier', () => {
    expect(
      MANIFEST_SIGNING_DOMAIN.equals(verifyLib.MANIFEST_SIGNING_DOMAIN)
    ).toBe(true);
  });

  test('a CI publish (API-key JWT) is reported to mdma, signed', async () => {
    const bundle = await signBundle(manifestFor('com.acme.ci', '1.0.0'), keysA);
    // Of what was signed: the handler rewrites metadata on this very object.
    const { _binary, ...signed } = bundle;
    const expectedDigest = manifestDigest(structuredClone(signed));
    await expect(
      verifyLib.verifyManifest(structuredClone(signed))
    ).resolves.toBe(true);
    const res = await call(pushHandler, {
      method: 'POST',
      headers: bearer(await mint({ via: 'api_key', key_id: 'key_1' })),
      body: bundle,
    });
    expect(res.statusCode).toBe(201);
    expect(mdma.badSig).toBe(0);
    expect(mdma.published).toHaveLength(1);
    const event = mdma.published[0];
    expect(event).toMatchObject({
      package: 'com.acme.ci',
      version: '1.0.0',
      org: ORG_A,
      visibility: 'private',
      manifest_digest: expectedDigest,
      bundle_digest: `sha256:${crypto
        .createHash('sha256')
        .update(Buffer.from(_binary, 'hex'))
        .digest('hex')}`,
      signer: Buffer.from(keysA.publicKey).toString('base64url'),
      via: 'api_key',
      key_id: 'key_1',
    });
    const audit = await call(auditHandler, {
      headers: bearer(await mint({ role: 'owner' })),
      query: { orgId: ORG_A },
    });
    expect(audit.body.events[0].actor).toMatchObject({
      api_key: true,
      key_id: 'key_1',
    });
  });

  test('a registry publish outside any Cloud org is not reported', async () => {
    await publish('org.example.open', '1.0.0', {
      keys: keysA,
      headers: bearer(await legacyToken('dev@example.org')),
    });
    expect(mdma.published).toEqual([]);
  });

  test("mdma's console upload: push-file with a publish JWT", async () => {
    const bundle = await signBundle(
      manifestFor('com.acme.web', '1.0.0'),
      keysA
    );
    const res = makeRes();
    await pushFileHandler(
      multipartReq(Buffer.from(bundle._binary, 'hex'), bearer(await mint())),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.visibility).toBe('private');
    expect(JSON.parse(mockKv.store.get('pkg:com.acme.web')).org_id).toBe(
      `cloud-${ORG_A}`
    );
    expect(mdma.published.map(e => e.package)).toEqual(['com.acme.web']);

    const readOnly = makeRes();
    const again = await signBundle(manifestFor('com.acme.web', '1.1.0'), keysA);
    await pushFileHandler(
      multipartReq(
        Buffer.from(again._binary, 'hex'),
        bearer(await mint({ scope: 'read' }))
      ),
      readOnly
    );
    expect(readOnly.statusCode).toBe(403);
  });
});

describe('reads hide private packages', () => {
  beforeEach(async () => {
    await publish('com.acme.secret', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    await publish('org.example.open', '1.0.0', {
      keys: keysOther,
      headers: bearer(await legacyToken('dev@example.org')),
    });
  });

  const names = res => res.body.map(b => b.package).sort();

  test('anonymous listing: public only, edge-cacheable as before', async () => {
    const res = await call(listHandler);
    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['org.example.open']);
    expect(res.headers['cache-control']).toMatch(/s-maxage=30/);
  });

  test("the org's read token sees it, uncached", async () => {
    const res = await call(listHandler, {
      headers: bearer(await mint({ scope: 'read' })),
      query: { include_private: '1' },
    });
    expect(names(res)).toEqual(['com.acme.secret', 'org.example.open']);
    expect(res.body.find(b => b.package === 'com.acme.secret').visibility).toBe(
      'private'
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test("mdma's listing call: ?fresh=1 with a read JWT", async () => {
    const res = await call(listHandler, {
      headers: bearer(await mint({ scope: 'read', role: 'developer' })),
      query: { fresh: '1' },
    });
    expect(names(res)).toEqual(['com.acme.secret', 'org.example.open']);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('another org does not', async () => {
    const res = await call(listHandler, {
      headers: bearer(await mint({ org: ORG_B, scope: 'read' })),
    });
    expect(names(res)).toEqual(['org.example.open']);
  });

  test('single-version reads answer 404 exactly like a missing package', async () => {
    process.env.REDIS_URL = 'redis://test';
    const q = { package: 'com.acme.secret', version: '1.0.0' };
    const missing = { package: 'com.acme.nothing', version: '1.0.0' };
    for (const handler of [listHandler, versionHandler]) {
      const hidden = await call(handler, { query: q });
      const absent = await call(handler, { query: missing });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.body).toEqual(absent.body);
      const allowed = await call(handler, {
        query: q,
        headers: bearer(await mint({ scope: 'read' })),
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['cache-control']).toBe('private, no-store');
    }
    delete process.env.REDIS_URL;
  });

  test('the composite package read', async () => {
    const hidden = await call(packageHandler, {
      query: { package: 'com.acme.secret' },
    });
    expect(hidden.statusCode).toBe(404);
    const ok = await call(packageHandler, {
      query: { package: 'com.acme.secret' },
      headers: bearer(await mint({ scope: 'read' })),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.visibility).toBe('private');
  });
});

describe('node downloads (HTTP, basic auth via userinfo)', () => {
  let binary;
  beforeEach(async () => {
    await publish('com.acme.secret', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    await publish('org.example.open', '1.0.0', {
      keys: keysOther,
      headers: bearer(await legacyToken('dev@example.org')),
    });
    binary = mockBlobs.get('com.acme.secret/1.0.0');
  });

  test('a public package stays open and is streamed with its length', async () => {
    const res = await download('org.example.open', '1.0.0');
    expect(res.status).toBe(200);
    expect(res.body.equals(mockBlobs.get('org.example.open/1.0.0'))).toBe(true);
    expect(Number(res.headers['content-length'])).toBe(res.body.length);
    expect(mdma.calls).toBe(0);
  });

  test('no credentials: the same 404 as a package that does not exist', async () => {
    const hidden = await download('com.acme.secret', '1.0.0');
    const absent = await download('com.acme.nothing', '1.0.0');
    expect(hidden.status).toBe(404);
    expect(JSON.parse(hidden.body)).toEqual(
      JSON.parse(absent.body.toString().replace('nothing', 'secret'))
    );
  });

  test("the org's cluster credential downloads it; the answer is cached", async () => {
    const res = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-a',
      pass: 'tok-a',
    });
    expect(res.status).toBe(200);
    expect(res.body.equals(binary)).toBe(true);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(mdma.badSig).toBe(0);
    // The owning org the registry recorded rides along for mdma to check.
    expect(mdma.orgs).toEqual([ORG_A]);
    const again = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-a',
      pass: 'tok-a',
    });
    expect(again.status).toBe(200);
    expect(mdma.calls).toBe(1);
  });

  test('a wrong token, or a valid cluster of another org, gets 404', async () => {
    const wrong = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-a',
      pass: 'nope',
    });
    expect(wrong.status).toBe(404);
    const otherOrg = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-b',
      pass: 'tok-b',
    });
    expect(otherOrg.status).toBe(404);
  });

  test('Cloud manager unreachable: 503, fail closed, not cached', async () => {
    mdma.down = true;
    const res = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-a',
      pass: 'tok-a',
    });
    expect(res.status).toBe(503);
    mdma.down = false;
    const later = await download('com.acme.secret', '1.0.0', {
      user: 'cluster-a',
      pass: 'tok-a',
    });
    expect(later.status).toBe(200);
  });

  test('a Cloud JWT with read scope downloads it; another org cannot', async () => {
    const ok = await download('com.acme.secret', '1.0.0', {
      headers: bearer(await mint({ scope: 'read' })),
    });
    expect(ok.status).toBe(200);
    const no = await download('com.acme.secret', '1.0.0', {
      headers: bearer(await mint({ org: ORG_B, scope: 'read' })),
    });
    expect(no.status).toBe(404);
  });
});

describe('visibility changes and the review queue', () => {
  beforeEach(async () => {
    await publish('com.acme.secret', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
  });

  const put = async (headers, visibility) =>
    call(visibilityHandler, {
      method: 'PUT',
      headers,
      query: { package: 'com.acme.secret' },
      body: { visibility },
    });

  test('a plain member cannot change it (and is told nothing exists)', async () => {
    const res = await put(bearer(await mint({ role: 'member' })), 'public');
    expect(res.statusCode).toBe(404);
  });

  test('going public waits for an admin; going private is immediate', async () => {
    const admin = bearer(await mint({ role: 'admin' }));
    const req = await put(admin, 'public');
    expect(req.statusCode).toBe(202);
    expect(req.body).toMatchObject({
      visibility: 'private',
      pending_visibility: 'public',
    });
    expect((await call(listHandler)).body).toEqual([]);

    // It shows up in the admin review queue even with no assets.
    mockAdmins.add('mod@calimero.network');
    const queue = await call(reviewQueueHandler, {
      headers: sessionCookie('mod@calimero.network'),
    });
    expect(queue.statusCode).toBe(200);
    const entry = queue.body.queue.find(e => e.package === 'com.acme.secret');
    expect(entry.visibilityRequest).toMatchObject({ to: 'public' });

    const approve = await call(adminPackageHandler, {
      method: 'PATCH',
      headers: sessionCookie('mod@calimero.network'),
      query: { packageName: 'com.acme.secret' },
      body: { action: 'approve' },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.body.visibility).toBe('public');
    expect((await call(listHandler)).body.map(b => b.package)).toEqual([
      'com.acme.secret',
    ]);

    const back = await put(admin, 'private');
    expect(back.statusCode).toBe(200);
    expect(back.body.visibility).toBe('private');
    expect((await call(listHandler)).body).toEqual([]);
  });

  test('a declined request leaves it private', async () => {
    await put(bearer(await mint()), 'public');
    mockAdmins.add('mod@calimero.network');
    const decline = await call(adminPackageHandler, {
      method: 'PATCH',
      headers: sessionCookie('mod@calimero.network'),
      query: { packageName: 'com.acme.secret' },
      body: { action: 'decline', reason: 'no' },
    });
    expect(decline.body.visibility).toBe('private');
  });
});

describe('audit log', () => {
  test('records publish, visibility, yank and delete, newest first', async () => {
    const admin = bearer(await mint());
    await publish('com.acme.app', '1.0.0', { keys: keysA, headers: admin });
    await call(visibilityHandler, {
      method: 'PUT',
      headers: admin,
      query: { package: 'com.acme.app' },
      body: { visibility: 'public' },
    });
    const yank = await call(yankHandler, {
      method: 'POST',
      headers: admin,
      query: { package: 'com.acme.app', version: '1.0.0' },
      body: { yanked: true },
    });
    expect(yank.statusCode).toBe(200);
    const del = await call(deleteHandler, {
      method: 'DELETE',
      headers: admin,
      query: { package: 'com.acme.app' },
    });
    expect(del.statusCode).toBe(200);
    expect(mockKv.store.has('pkg:com.acme.app')).toBe(false);

    // By Cloud org id or registry org id.
    for (const orgId of [ORG_A, `cloud-${ORG_A}`]) {
      const res = await call(auditHandler, {
        headers: bearer(await mint({ role: 'owner', scope: 'read' })),
        query: { orgId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.events.map(e => e.type)).toEqual([
        'delete_package',
        'yank',
        'visibility_request',
        'publish',
      ]);
      expect(res.body.events[3]).toMatchObject({
        package: 'com.acme.app',
        version: '1.0.0',
        actor: { id: 'dev@acme.io', via: 'cloud', cloud_org_id: ORG_A },
      });
    }
  });

  test('members and other orgs cannot read it', async () => {
    await publish('com.acme.app', '1.0.0', {
      keys: keysA,
      headers: bearer(await mint()),
    });
    const member = await call(auditHandler, {
      headers: bearer(await mint({ role: 'member' })),
      query: { orgId: ORG_A },
    });
    expect(member.statusCode).toBe(403);
    const other = await call(auditHandler, {
      headers: bearer(await mint({ org: ORG_B, role: 'owner' })),
      query: { orgId: ORG_A },
    });
    expect(other.statusCode).toBe(403);
  });
});
