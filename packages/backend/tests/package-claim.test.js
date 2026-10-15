/**
 * Who manages a package follows its signing key: an account becomes the
 * manager only with a fresh claim, signed by a package key, that names it.
 */

const { Readable } = require('stream');

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
  del: async k => (store.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async (k, ...m) => {
    m.flat().forEach(x => sets.get(k)?.delete(String(x)));
    return m.length;
  },
  sIsMember: async (k, m) => (sets.has(k) ? sets.get(k).has(String(m)) : false),
  hGetAll: async k => (hashes.has(k) ? { ...hashes.get(k) } : {}),
  hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
  hSet: async (k, obj) => {
    if (!hashes.has(k)) hashes.set(k, {});
    Object.assign(hashes.get(k), obj);
    return Object.keys(obj).length;
  },
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
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async () => '1'),
  getBinary: jest.fn(async () => null),
  deleteBinary: jest.fn(async () => {}),
}));

const mockAdmins = new Set();
const mockBots = new Set();
const mockProfiles = new Map();
const mockAdminStorage = () => ({
  isAdmin: async email => mockAdmins.has(email),
  isBot: async email => mockBots.has(email),
});
const mockUserStorage = () => ({
  getUserByEmail: async email =>
    mockProfiles.get(email) || { email, username: email.split('@')[0] },
});
jest.mock('../../../api/lib/admin-storage', () => mockAdminStorage());
jest.mock('../src/lib/admin-storage', () => mockAdminStorage());
jest.mock('../../../api/lib/user-storage', () => mockUserStorage());
jest.mock('../src/lib/user-storage', () => mockUserStorage());

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async r => {
      const email = r.headers?.['x-test-user'];
      return email ? { id: email, email } : null;
    },
    requireAuth: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (email) return { id: email, email };
      res.status(401).json({ error: 'unauthorized' });
      return null;
    },
  };
});

const { TEST_ICON } = require('./helpers/publishable');
const {
  generateKeypair,
  signBundle,
  signClaim: helperSignClaim,
} = require('./helpers/ed25519-helper');
const pushHandler = require('../../../api/v2/bundles/push');
const { claimRefusal } = require('../src/lib/package-claim');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const claimHandler = require('../../../api/v2/packages/[package]/claim');
const {
  manifestOwnedByUser,
} = require('@calimero-network/registry-shared/package-permissions');

const PKG = 'com.acme.claimed';
const ORG = 'org-squat';
const HOLDER = 'holder@example.com';
const SQUATTER = 'squatter@example.com';

let packageKey;
let otherKey;

function manifest(appVersion) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Claimed',
      description: 'A package used to exercise who manages it.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
  };
}

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

const signClaim = (keys, account, { pkg = PKG, issuedAt } = {}) =>
  helperSignClaim(keys, account, pkg, issuedAt);

async function push(email, body, claim) {
  const res = makeRes();
  await pushHandler(
    {
      method: 'POST',
      body: claim ? { ...body, _claim: claim } : body,
      headers: { 'x-test-user': email },
    },
    res
  );
  return res;
}

async function pushFile(email, bundle, claim) {
  const boundary = 'claimbundle';
  const parts = [];
  if (claim) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="claim"\r\n\r\n${JSON.stringify(claim)}\r\n`
      )
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="b.mpk"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    Buffer.from(bundle._binary, 'hex'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );
  const body = Buffer.concat(parts);
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
    'x-test-user': email,
  };
  const res = makeRes();
  await pushFileHandler(req, res);
  return res;
}

async function claim(email, body) {
  const res = makeRes();
  await claimHandler(
    {
      method: 'POST',
      query: { package: PKG },
      body,
      headers: email ? { 'x-test-user': email } : {},
    },
    res
  );
  return res;
}

function stored(version) {
  const raw = store.get(`bundle:${PKG}/${version}`);
  return raw ? JSON.parse(raw).json : null;
}

beforeAll(async () => {
  packageKey = await generateKeypair();
  otherKey = await generateKeypair();
});

beforeEach(() => {
  store.clear();
  sets.clear();
  hashes.clear();
  mockAdmins.clear();
  mockBots.clear();
  mockProfiles.clear();
});

describe('first publish', () => {
  test('without a claim, publishes the package with no managing account', async () => {
    const res = await push(
      SQUATTER,
      await signBundle(manifest('1.0.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBeUndefined();
    expect(stored('1.0.0')._claim).toBeUndefined();
  });

  test('with a claim by the signing key naming the pusher, binds the pusher', async () => {
    const res = await push(
      HOLDER,
      await signBundle(manifest('1.0.0'), packageKey),
      await signClaim(packageKey, HOLDER)
    );
    expect(res.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(HOLDER);
    expect(stored('1.0.0')._claim).toBeUndefined();
  });

  test.each([
    ['signed by another key', () => signClaim(otherKey, HOLDER)],
    ['naming another account', () => signClaim(packageKey, SQUATTER)],
    [
      'for another package',
      () => signClaim(packageKey, HOLDER, { pkg: 'com.acme.other' }),
    ],
    [
      'issued too long ago',
      () =>
        signClaim(packageKey, HOLDER, {
          issuedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        }),
    ],
  ])('a claim %s is refused', async (_label, makeClaim) => {
    const res = await push(
      HOLDER,
      await signBundle(manifest('1.0.0'), packageKey),
      await makeClaim()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_claim');
    expect(stored('1.0.0')).toBeNull();
  });

  test('push-file binds the pusher only with a claim', async () => {
    const bundle = await signBundle(manifest('1.0.0'), packageKey);
    expect(
      (await pushFile(HOLDER, bundle, await signClaim(packageKey, HOLDER)))
        .statusCode
    ).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(HOLDER);
  });

  test('push-file without a claim leaves the package unmanaged', async () => {
    const res = await pushFile(
      SQUATTER,
      await signBundle(manifest('1.0.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBeUndefined();
  });

  test('an unmanaged package belongs to no account, so none can link it to an org', async () => {
    await push(SQUATTER, await signBundle(manifest('1.0.0'), packageKey));
    expect(manifestOwnedByUser(stored('1.0.0'), { email: SQUATTER })).toBe(
      false
    );
  });
});

describe('POST /api/v2/packages/:package/claim', () => {
  beforeEach(async () => {
    // A package another account already manages and has linked to its org.
    await push(
      SQUATTER,
      await signBundle(manifest('1.0.0'), packageKey),
      await signClaim(packageKey, SQUATTER)
    );
    await push(SQUATTER, await signBundle(manifest('1.1.0'), packageKey));
    store.set(`pkg2org:${PKG}`, ORG);
    sets.set(`org:${ORG}:packages`, new Set([PKG]));
  });

  test('a fresh claim by a package key moves management to the claiming account', async () => {
    const res = await claim(HOLDER, await signClaim(packageKey, HOLDER));
    expect(res.statusCode).toBe(200);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(HOLDER);
    expect(stored('1.1.0').metadata._ownerEmail).toBe(HOLDER);
    expect(store.has(`pkg2org:${PKG}`)).toBe(false);
    expect(sets.get(`org:${ORG}:packages`).has(PKG)).toBe(false);
  });

  test.each([
    [
      'signed by a key that does not own the package',
      () => signClaim(otherKey, HOLDER),
    ],
    ['naming another account', () => signClaim(packageKey, SQUATTER)],
    [
      'issued too long ago',
      () =>
        signClaim(packageKey, HOLDER, {
          issuedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        }),
    ],
    ['malformed', async () => ({ publicKey: 'x', signature: 'y' })],
  ])('a claim %s changes nothing', async (_label, makeClaim) => {
    const res = await claim(HOLDER, await makeClaim());
    expect([400, 403]).toContain(res.statusCode);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(SQUATTER);
    expect(store.get(`pkg2org:${PKG}`)).toBe(ORG);
  });

  test('needs a logged-in account', async () => {
    const res = await claim(null, await signClaim(packageKey, HOLDER));
    expect(res.statusCode).toBe(401);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(SQUATTER);
  });

  test('an unknown package is 404', async () => {
    const res = makeRes();
    await claimHandler(
      {
        method: 'POST',
        query: { package: 'com.acme.nothing' },
        body: await signClaim(packageKey, HOLDER, { pkg: 'com.acme.nothing' }),
        headers: { 'x-test-user': HOLDER },
      },
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('the claim the CLI signs', () => {
  // The same vector is produced by packages/cli/src/test/package-claim.test.ts.
  const VECTOR = {
    publicKey: '6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw',
    signature:
      'r2OG9Q6Av6rGz9jiEBOhYTp2il8rIg9JN2t5iXlX9NQFO6tKTdZkwwGEb-VVYUXMP9LPdbBSc4VSz0oetJRcAA',
    issuedAt: '2026-10-15T00:00:00.000Z',
  };

  test('verifies here', async () => {
    const refusal = await claimRefusal(VECTOR, {
      packageName: 'com.acme.claimed',
      account: 'holder@example.com',
      now: Date.parse(VECTOR.issuedAt),
    });
    expect(refusal).toBeNull();
  });
});
