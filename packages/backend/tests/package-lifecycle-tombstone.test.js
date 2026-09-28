/**
 * Package lifecycle: a deleted name/version stays deleted.
 *
 * Deleting a package used to empty its bundle keys but leave its review
 * decision, its assets and its org link behind, and nothing stopped the name
 * being re-registered afterwards — so a same-named republish could silently
 * inherit trust, pictures and an org it never earned. These lock in the two
 * halves of the fix: a complete cleanup on delete, and a tombstone that refuses
 * the resurrection.
 *
 * Everything runs against an in-memory Redis stand-in and a fake GCS bucket, so
 * it stays in the default `pnpm test` run.
 */

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async k => {
    const next = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
    store.set(k, String(next));
    return next;
  },
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async (k, m) => (sets.get(k)?.delete(String(m)) ? 1 : 0),
  sIsMember: async (k, m) => (sets.get(k)?.has(String(m)) ? 1 : 0),
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

// The bucket cannot run in-process; object bytes live in a Map.
const mockObjects = new Map();
jest.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return {
        file(key) {
          return {
            async save(buf) {
              mockObjects.set(key, Buffer.from(buf));
            },
            async download() {
              if (!mockObjects.has(key)) {
                const err = new Error('not found');
                err.code = 404;
                throw err;
              }
              return [mockObjects.get(key)];
            },
            async delete() {
              mockObjects.delete(key);
            },
          };
        },
      };
    }
  },
}));

process.env.GCS_BUCKET = 'test-bucket';

// Signatures are exercised elsewhere; here every publish is well-signed.
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

const OWNER = 'owner@example.com';
const ADMIN = 'admin@calimero.network';

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async r => {
      const email = r.headers?.['x-test-user'];
      return email ? { id: email, email, username: email.split('@')[0] } : null;
    },
    requireAuth: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (!email) {
        res.status(401).json({ error: 'unauthenticated' });
        return null;
      }
      return { id: email, email, username: email.split('@')[0] };
    },
    requireAdmin: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (email !== ADMIN) {
        res.status(403).json({ error: 'forbidden' });
        return null;
      }
      return { id: email, email };
    },
    canManagePackage: async (_pkg, _manifest, user) => user?.email === OWNER,
  };
});

jest.mock('../../../api/lib/admin-storage', () => ({
  isAdmin: async email => email === ADMIN,
  isBot: async () => false,
  setAdminVerified: async () => {},
  getAdminVerified: async () => false,
}));

jest.mock('../../../api/lib/user-storage', () => ({
  getUserByEmail: async email => ({ username: email.split('@')[0] }),
}));

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');
const review = require('../src/lib/package-review');
const { addAsset, listAssets } = require('../src/lib/asset-store');
const {
  getPkg2Org,
  setPkg2Org,
  getPackagesByOrg,
} = require('../src/lib/org-storage');
const {
  reviewKey,
  legacyKey,
  DECIDED_SET,
} = require('@calimero-network/registry-shared/package-review');
const { TEST_ICON } = require('./helpers/publishable');

const pushHandler = require('../../../api/v2/bundles/push');
const adminPkgHandler = require('../../../api/admin/packages/[packageName]');
const userDeleteHandler = require('../../../api/v2/bundles/[package]');
const assetsHandler = require('../../../api/v2/packages/[package]/assets/index');

const PKG = 'com.example.widget';
const ORG_ID = 'acme';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

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
    end(p) {
      if (p !== undefined) this.body = p;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

/** A well-formed, publishable manifest for a brand-new package. */
function publishableManifest(overrides = {}) {
  return {
    version: '1.0',
    package: PKG,
    appVersion: '1.0.0',
    metadata: {
      name: 'Widget',
      description: 'A widget for exercising the package lifecycle.',
      author: 'Owner',
      category: 'developer-tools',
      icon: TEST_ICON,
      ...(overrides.metadata || {}),
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
    ...overrides,
  };
}

/** Seed one published version, with an owner email so publisherOf can resolve. */
async function seedPackage({ ownerEmail = OWNER } = {}) {
  store.clear();
  sets.clear();
  mockObjects.clear();
  sets.set('bundles:all', new Set([PKG]));
  sets.set(`bundle-versions:${PKG}`, new Set(['1.0.0']));
  store.set(
    `bundle:${PKG}/1.0.0`,
    JSON.stringify({
      json: {
        package: PKG,
        appVersion: '1.0.0',
        metadata: { author: 'Owner', name: 'Widget', _ownerEmail: ownerEmail },
        signature: { pubkey: 'pk' },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
  store.set(`downloads:${PKG.toLowerCase()}`, '5');
}

describe('complete cleanup on package delete', () => {
  beforeEach(() => seedPackage());

  test('removes review state, assets and the org link, and tombstones the name', async () => {
    // Give the package everything a live package accumulates.
    await review.setReview(PKG, { state: 'approved', by: ADMIN });
    await setPkg2Org(PKG, ORG_ID);
    const added = await addAsset(PKG, PNG, { alt: 'shot' });
    expect(added.ok).toBe(true);
    expect(await listAssets(PKG)).toHaveLength(1);
    expect(await getPkg2Org(PKG)).toBe(ORG_ID);
    expect(await getPackagesByOrg(ORG_ID)).toContain(PKG);

    await new BundleStorageKV().deletePackage(PKG);

    // Bundle data gone.
    expect(store.has(`bundle:${PKG}/1.0.0`)).toBe(false);
    expect(sets.get('bundles:all')?.has(PKG)).toBeFalsy();
    expect(store.has(`downloads:${PKG.toLowerCase()}`)).toBe(false);

    // Review decision gone — record, legacy key and decided-set membership.
    expect(store.has(reviewKey(PKG))).toBe(false);
    expect(store.has(legacyKey(PKG))).toBe(false);
    expect(sets.get(DECIDED_SET)?.has(PKG)).toBeFalsy();

    // Assets gone — index and bytes.
    expect(await listAssets(PKG)).toEqual([]);
    expect(mockObjects.size).toBe(0);

    // Org link gone, both directions.
    expect(await getPkg2Org(PKG)).toBeNull();
    expect(await getPackagesByOrg(ORG_ID)).not.toContain(PKG);

    // And the name is retired.
    expect(await new BundleStorageKV().isRetired(PKG)).toBe(true);
  });

  test('the user-facing delete route cleans up as thoroughly as the admin route', async () => {
    await review.setReview(PKG, { state: 'approved', by: ADMIN });
    await setPkg2Org(PKG, ORG_ID);
    await addAsset(PKG, PNG, { alt: 'shot' });

    const res = makeRes();
    await userDeleteHandler(
      {
        method: 'DELETE',
        query: { package: PKG },
        headers: { 'x-test-user': OWNER },
      },
      res
    );
    expect(res.statusCode).toBe(200);

    expect(store.has(reviewKey(PKG))).toBe(false);
    expect(await listAssets(PKG)).toEqual([]);
    expect(await getPkg2Org(PKG)).toBeNull();
    expect(await new BundleStorageKV().isRetired(PKG)).toBe(true);
  });

  test('the admin delete route retires the name and clears the org link', async () => {
    await setPkg2Org(PKG, ORG_ID);
    await addAsset(PKG, PNG, { alt: 'shot' });

    const res = makeRes();
    await adminPkgHandler(
      {
        method: 'DELETE',
        query: { packageName: PKG },
        headers: { 'x-test-user': ADMIN },
      },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(await getPkg2Org(PKG)).toBeNull();
    expect(await new BundleStorageKV().isRetired(PKG)).toBe(true);
  });
});

describe('a deleted name cannot be re-published (tombstone)', () => {
  beforeEach(() => seedPackage());

  test('re-publishing a deleted package is refused with 409 name_retired', async () => {
    await new BundleStorageKV().deletePackage(PKG);

    const res = makeRes();
    await pushHandler(
      { method: 'POST', body: publishableManifest(), headers: {} },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('name_retired');
  });

  test('replaying a single deleted version is refused', async () => {
    // Two versions; delete only 1.1.0, then try to replay exactly that one.
    sets.get(`bundle-versions:${PKG}`).add('1.1.0');
    store.set(
      `bundle:${PKG}/1.1.0`,
      JSON.stringify({
        json: { package: PKG, appVersion: '1.1.0', metadata: {} },
        created_at: '2026-01-02T00:00:00.000Z',
      })
    );

    await new BundleStorageKV().deleteBundleVersion(PKG, '1.1.0');

    const res = makeRes();
    await pushHandler(
      {
        method: 'POST',
        body: publishableManifest({ appVersion: '1.1.0' }),
        headers: {},
      },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('name_retired');
  });
});

describe('a new asset re-opens review on an approved package (finding #12)', () => {
  async function upload(email = OWNER) {
    const res = makeRes();
    await assetsHandler(
      {
        method: 'POST',
        query: { package: PKG },
        body: { data: PNG.toString('base64'), alt: 'a shot' },
        headers: { 'x-test-user': email },
        cookies: {},
      },
      res
    );
    return res;
  }

  test('an explicitly approved package drops back to pending', async () => {
    await seedPackage();
    await review.setReview(PKG, { state: 'approved', by: ADMIN });
    expect((await review.getReview(PKG)).state).toBe('approved');

    const res = await upload();
    expect(res.statusCode).toBe(201);
    expect((await review.getReview(PKG)).state).toBe('pending');
  });

  test('a trusted-publisher auto-approval is left alone', async () => {
    // Owner on the trusted domain — approved on read, no stored decision.
    await seedPackage({ ownerEmail: 'dev@calimero.network' });
    const before = await review.getReview(PKG);
    expect(before.state).toBe('approved');
    expect(before.auto).toBe(true);

    const res = await upload();
    expect(res.statusCode).toBe(201);
    const after = await review.getReview(PKG);
    expect(after.state).toBe('approved');
    expect(after.auto).toBe(true);
  });
});
