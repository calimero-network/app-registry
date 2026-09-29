/**
 * Package ownership (`metadata._ownerEmail`) is recorded once, at the first
 * publish, and carried forward unchanged by every later version — whichever
 * account pushes that version. Publishing a version is authorized by the
 * signing key; managing the package (delete, yank, assets, org link) belongs to
 * the account that first published it.
 *
 * Runs push.js against an in-memory Redis stand-in, then asks the real
 * permission helpers who may manage the stored package.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  setNX: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
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
  hSet: async () => 0,
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

// Signature checks pass: the second account holds a validly signed manifest
// for the allowed key, which is exactly the case under test.
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

let mockCurrentUser = null;
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async () => mockCurrentUser,
    requireAuth: async () => mockCurrentUser,
  };
});

const mockUsernames = new Map();
jest.mock('../../../api/lib/user-storage', () => {
  const actual = jest.requireActual('../../../api/lib/user-storage');
  return {
    ...actual,
    getUserByEmail: async email =>
      mockUsernames.has(email)
        ? { email, username: mockUsernames.get(email) }
        : null,
  };
});

const pushHandler = require('../../../api/v2/bundles/push');
const deleteHandler = require('../../../api/v2/bundles/[package]');
const { canManagePackage } = jest.requireActual(
  '../../../api/lib/auth-helpers'
);
const {
  findExistingOwnerEmail,
  stampOwnerEmail,
} = require('../src/lib/package-owner');
const { TEST_ICON } = require('./helpers/publishable');

const PKG = 'com.example.owned';
const ALICE = { email: 'alice@example.com', username: 'alice' };
const BOB = { email: 'bob@example.org', username: 'bob' };
const BOB_NO_USERNAME = { email: 'bob@example.org', username: null };

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

function makeManifest(appVersion, metadata = {}) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Owned App',
      description: 'An app used to exercise package ownership across versions.',
      category: 'developer-tools',
      icon: TEST_ICON,
      ...metadata,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
  };
}

async function pushAs(user, manifest) {
  mockCurrentUser = user;
  const res = makeRes();
  await pushHandler({ method: 'POST', headers: {}, body: manifest }, res);
  return res;
}

function stored(version) {
  const raw = store.get(`bundle:${PKG}/${version}`);
  return raw ? JSON.parse(raw).json : null;
}

/** Seed a version directly, as legacy data written by an older server. */
function seedVersion(version, metadata) {
  store.set(
    `bundle:${PKG}/${version}`,
    JSON.stringify({ json: { ...makeManifest(version), metadata } })
  );
  if (!sets.has(`bundle-versions:${PKG}`)) {
    sets.set(`bundle-versions:${PKG}`, new Set());
  }
  sets.get(`bundle-versions:${PKG}`).add(version);
}

async function tryDelete(user) {
  mockCurrentUser = user;
  const res = makeRes();
  await deleteHandler(
    { method: 'DELETE', headers: {}, query: { package: PKG } },
    res
  );
  return res;
}

beforeEach(() => {
  store.clear();
  sets.clear();
  hashes.clear();
  mockUsernames.clear();
  mockUsernames.set(ALICE.email, ALICE.username);
  mockCurrentUser = null;
});

describe('first publish', () => {
  test('stamps the publishing account as the owner', async () => {
    const res = await pushAs(ALICE, makeManifest('1.0.0'));
    expect(res.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(ALICE.email);
  });

  test('ignores an owner email supplied in the signed manifest', async () => {
    const res = await pushAs(
      ALICE,
      makeManifest('1.0.0', { _ownerEmail: 'someone@else.example' })
    );
    expect(res.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(ALICE.email);
  });
});

describe('a later version pushed by a different account', () => {
  test('keeps the original owner, and the pusher cannot manage the package', async () => {
    mockUsernames.set(BOB.email, BOB.username);
    expect((await pushAs(ALICE, makeManifest('1.0.0'))).statusCode).toBe(201);

    const res = await pushAs(BOB, makeManifest('2.0.0'));
    expect(res.statusCode).toBe(201);

    const latest = stored('2.0.0');
    expect(latest.metadata._ownerEmail).toBe(ALICE.email);
    expect(await canManagePackage(PKG, latest, BOB)).toBe(false);
    expect(await canManagePackage(PKG, latest, ALICE)).toBe(true);

    const del = await tryDelete(BOB);
    expect(del.statusCode).toBe(403);
    expect(stored('2.0.0')).not.toBeNull();
  });

  test('keeps the original owner when the oldest version has no author', async () => {
    // Legacy first version: owner recorded, no public author.
    seedVersion('1.0.0', {
      name: 'Owned App',
      _ownerEmail: ALICE.email,
    });

    const res = await pushAs(BOB_NO_USERNAME, makeManifest('2.0.0'));
    expect(res.statusCode).toBe(201);

    const latest = stored('2.0.0');
    expect(latest.metadata._ownerEmail).toBe(ALICE.email);
    expect(await canManagePackage(PKG, latest, BOB_NO_USERNAME)).toBe(false);
    expect((await tryDelete(BOB_NO_USERNAME)).statusCode).toBe(403);
  });

  test('inherits the owner from a later version when the oldest has none', async () => {
    seedVersion('1.0.0', { name: 'Owned App' });
    seedVersion('1.1.0', { name: 'Owned App', _ownerEmail: ALICE.email });

    const res = await pushAs(BOB_NO_USERNAME, makeManifest('2.0.0'));
    expect(res.statusCode).toBe(201);
    expect(stored('2.0.0').metadata._ownerEmail).toBe(ALICE.email);
  });

  test('leaves the owner unset on legacy data with no recorded owner', async () => {
    seedVersion('1.0.0', { name: 'Owned App', author: 'legacy@example.net' });

    const res = await pushAs(BOB_NO_USERNAME, makeManifest('2.0.0'));
    expect(res.statusCode).toBe(201);

    const latest = stored('2.0.0');
    expect(latest.metadata._ownerEmail).toBeUndefined();
    expect(await canManagePackage(PKG, latest, BOB_NO_USERNAME)).toBe(false);
  });

  test('the original owner publishing again keeps ownership', async () => {
    expect((await pushAs(ALICE, makeManifest('1.0.0'))).statusCode).toBe(201);
    expect((await pushAs(ALICE, makeManifest('1.1.0'))).statusCode).toBe(201);
    expect(stored('1.1.0').metadata._ownerEmail).toBe(ALICE.email);
  });
});

describe('package-owner helpers', () => {
  const fakeStore = manifests => ({
    getBundleManifest: jest.fn(async (_pkg, v) => manifests[v] ?? null),
  });

  test('findExistingOwnerEmail walks from the oldest version', async () => {
    const s = fakeStore({
      '1.0.0': { metadata: {} },
      '2.0.0': { metadata: { _ownerEmail: 'first@example.com' } },
      '3.0.0': { metadata: { _ownerEmail: 'later@example.com' } },
    });
    expect(
      await findExistingOwnerEmail(s, PKG, ['3.0.0', '2.0.0', '1.0.0'])
    ).toBe('first@example.com');
  });

  test('findExistingOwnerEmail never reads author', async () => {
    const s = fakeStore({ '1.0.0': { metadata: { author: 'a@example.com' } } });
    expect(await findExistingOwnerEmail(s, PKG, ['1.0.0'])).toBeNull();
  });

  test('stampOwnerEmail uses already-loaded manifests', async () => {
    const s = fakeStore({});
    const manifest = { package: PKG, metadata: {} };
    await stampOwnerEmail({
      store: s,
      manifest,
      versions: ['1.0.0'],
      publisherEmail: 'pusher@example.com',
      known: { '1.0.0': { metadata: { _ownerEmail: 'owner@example.com' } } },
    });
    expect(manifest.metadata._ownerEmail).toBe('owner@example.com');
    expect(s.getBundleManifest).not.toHaveBeenCalled();
  });

  test('stampOwnerEmail never falls back to the publisher on an existing package', async () => {
    const s = fakeStore({ '1.0.0': { metadata: {} } });
    const manifest = {
      package: PKG,
      metadata: { _ownerEmail: 'pusher@example.com' },
    };
    const owner = await stampOwnerEmail({
      store: s,
      manifest,
      versions: ['1.0.0'],
      publisherEmail: 'pusher@example.com',
    });
    expect(owner).toBeNull();
    expect(manifest.metadata._ownerEmail).toBeUndefined();
  });
});

describe('every publish path shares the owner stamping', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../..');

  test.each([
    'api/v2/bundles/push.js',
    'api/v2/bundles/push-file.js',
    'packages/backend/src/server.js',
  ])('%s stamps ownership via stampOwnerEmail', rel => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src).toMatch(/stampOwnerEmail\(/);
    // No path copies the author into _ownerEmail.
    expect(src).not.toMatch(/_ownerEmail\s*=[^;]*existingAuthor/);
  });
});
