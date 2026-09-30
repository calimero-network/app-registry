/**
 * Organization publishing: who may publish a new version with a key that is
 * not one of the package's keys, and what that version does to the key set.
 *
 * - A plain org member must use a package key; only an org admin/owner may
 *   publish with their own key.
 * - A version published that way keeps the package's existing key set
 *   (`_ownerKeys`), so the original key still publishes afterwards and the
 *   admin's key is not added to it.
 * - Both push endpoints decide this through resolvePublishPermission, and the
 *   Fastify dev server's copy answers the same.
 *
 * Runs push.js against an in-memory KV with real ownership logic; only the
 * Ed25519 check itself is stubbed.
 */

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

// Real key/ownership logic; only the signature check is stubbed.
jest.mock('../../../api/lib/verify', () => ({
  ...jest.requireActual('../../../api/lib/verify'),
  verifyManifest: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async r => {
      const email = r.headers?.['x-test-user'];
      return email ? { id: email, email } : null;
    },
  };
});

jest.mock('../../../api/lib/admin-storage', () => ({
  isAdmin: async () => false,
  isBot: async () => false,
}));

jest.mock('../../../api/lib/user-storage', () => ({
  getUserByEmail: async email => ({ username: email.split('@')[0] }),
}));

const { TEST_ICON } = require('./helpers/publishable');
const pushHandler = require('../../../api/v2/bundles/push');
const orgs = require('../../../api/lib/org-storage');
const devOrgs = require('../src/lib/org-storage');
const { getOwnerKeys, isAllowedOwner } = require('../../../api/lib/verify');
const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');

const PKG = 'com.acme.widget';
const ORG = 'org-acme';
const ORIGINAL_KEY = 'b3JpZ2luYWwta2V5';
const ADMIN_KEY = 'YWRtaW4ta2V5';
const MEMBER_KEY = 'bWVtYmVyLWtleQ';

const AUTHOR = 'author@example.com';
const ADMIN = 'admin@example.com';
const OWNER = 'owner@example.com';
const MEMBER = 'member@example.com';

function manifest(appVersion, publicKey, extra = {}) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Widget',
      description: 'A widget used to exercise organization publishing rules.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey,
      signature: 'c2lnbmF0dXJl',
    },
    ...extra,
  };
}

async function push(email, body) {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  await pushHandler(
    { method: 'POST', body, headers: { 'x-test-user': email } },
    res
  );
  return {
    status: res.status.mock.calls[0]?.[0],
    body: res.json.mock.calls[0]?.[0],
  };
}

async function stored(version) {
  return new BundleStorageKV().getBundleManifest(PKG, version);
}

beforeEach(async () => {
  store.clear();
  sets.clear();
  hashes.clear();
  await orgs.addOrgMember(ORG, OWNER, 'owner');
  await orgs.addOrgMember(ORG, ADMIN, 'admin');
  await orgs.addOrgMember(ORG, MEMBER, 'member');
  // First version: published by the author with the package key.
  const first = await push(AUTHOR, manifest('1.0.0', ORIGINAL_KEY));
  expect(first.status).toBe(201);
  await orgs.setPkg2Org(PKG, ORG);
});

describe('push.js organization publishing', () => {
  test('a plain org member cannot publish with their own key', async () => {
    const r = await push(MEMBER, manifest('1.1.0', MEMBER_KEY));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('not_owner');
    expect(await stored('1.1.0')).toBeNull();
  });

  test('a plain org member can still publish with the package key', async () => {
    const r = await push(MEMBER, manifest('1.1.0', ORIGINAL_KEY));
    expect(r.status).toBe(201);
  });

  test('an org admin publishes with their own key; the original key keeps publishing', async () => {
    const r = await push(ADMIN, manifest('1.1.0', ADMIN_KEY));
    expect(r.status).toBe(201);
    expect((await stored('1.1.0'))._ownerKeys).toEqual([ORIGINAL_KEY]);

    const next = await push(AUTHOR, manifest('1.2.0', ORIGINAL_KEY));
    expect(next.status).toBe(201);
  });

  test('an org owner may publish with their own key too', async () => {
    const r = await push(OWNER, manifest('1.1.0', ADMIN_KEY));
    expect(r.status).toBe(201);
  });

  test('owners[] in an organization publish does not replace the key set', async () => {
    const r = await push(
      ADMIN,
      manifest('1.1.0', ADMIN_KEY, { owners: [ADMIN_KEY] })
    );
    expect(r.status).toBe(201);

    // The original key is still accepted...
    expect(isAllowedOwner(await stored('1.1.0'), ORIGINAL_KEY)).toBe(true);
    // ...and the admin's key did not become a package key.
    expect(isAllowedOwner(await stored('1.1.0'), ADMIN_KEY)).toBe(false);
  });

  test('a removed admin can no longer publish with their key', async () => {
    expect((await push(ADMIN, manifest('1.1.0', ADMIN_KEY))).status).toBe(201);
    await orgs.removeOrgMember(ORG, ADMIN);

    const r = await push(ADMIN, manifest('1.2.0', ADMIN_KEY));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('not_owner');
  });

  test('an admin demoted to member can no longer publish with their key', async () => {
    await orgs.updateOrgMemberRole(ORG, ADMIN, 'member');
    const r = await push(ADMIN, manifest('1.1.0', ADMIN_KEY));
    expect(r.status).toBe(403);
  });

  test('a removed member is refused', async () => {
    await orgs.removeOrgMember(ORG, MEMBER);
    const r = await push(MEMBER, manifest('1.1.0', MEMBER_KEY));
    expect(r.status).toBe(403);
  });

  test('a client-supplied _ownerKeys is never stored', async () => {
    const r = await push(
      AUTHOR,
      manifest('1.1.0', ORIGINAL_KEY, { _ownerKeys: [MEMBER_KEY] })
    );
    expect(r.status).toBe(201);
    expect((await stored('1.1.0'))._ownerKeys).toBeUndefined();

    const m = await push(MEMBER, manifest('1.2.0', MEMBER_KEY));
    expect(m.status).toBe(403);
  });
});

describe('push.js version ordering', () => {
  test.each(['1.0.0', '0.9.0', '1.0.0-rc.1'])(
    'refuses %s after 1.0.0 without storing it',
    async version => {
      const r = await push(AUTHOR, manifest(version, ORIGINAL_KEY));
      expect(r.status).toBe(400);
      expect(r.body).toEqual({
        error: 'version_not_allowed',
        message: `New version (${version}) must be greater than latest (1.0.0).`,
      });
      if (version !== '1.0.0') expect(await stored(version)).toBeNull();
    }
  );

  test('an org admin cannot publish a lower version either', async () => {
    const r = await push(ADMIN, manifest('0.1.0', ADMIN_KEY));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('version_not_allowed');
    expect(await stored('0.1.0')).toBeNull();
  });

  test('a greater version is accepted', async () => {
    const r = await push(AUTHOR, manifest('1.0.1', ORIGINAL_KEY));
    expect(r.status).toBe(201);
  });
});

describe('resolvePublishPermission (shared by push.js, push-file.js and the dev server)', () => {
  const latest = manifest('1.0.0', ORIGINAL_KEY);

  test.each([
    ['api/lib', orgs],
    ['dev server', devOrgs],
  ])('%s: key, admin, owner, member and outsider', async (_label, lib) => {
    await expect(
      lib.resolvePublishPermission(latest, ORIGINAL_KEY, PKG, MEMBER)
    ).resolves.toEqual({ allowed: true, viaOrg: false, ownerKeys: null });
    await expect(
      lib.resolvePublishPermission(latest, ADMIN_KEY, PKG, ADMIN)
    ).resolves.toEqual({
      allowed: true,
      viaOrg: true,
      ownerKeys: [ORIGINAL_KEY],
    });
    await expect(
      lib.resolvePublishPermission(latest, ADMIN_KEY, PKG, OWNER)
    ).resolves.toMatchObject({ allowed: true, viaOrg: true });
    await expect(
      lib.resolvePublishPermission(latest, MEMBER_KEY, PKG, MEMBER)
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      lib.resolvePublishPermission(latest, MEMBER_KEY, PKG, 'x@example.com')
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      lib.resolvePublishPermission(latest, MEMBER_KEY, PKG, undefined)
    ).resolves.toMatchObject({ allowed: false });
  });
});

describe('getOwnerKeys', () => {
  test('stamped key set wins, then owners[], then the signer', () => {
    const base = manifest('1.0.0', ADMIN_KEY);
    expect(getOwnerKeys(base)).toEqual([ADMIN_KEY]);
    expect(getOwnerKeys({ ...base, owners: [MEMBER_KEY] })).toEqual([
      MEMBER_KEY,
    ]);
    expect(
      getOwnerKeys({
        ...base,
        owners: [MEMBER_KEY],
        _ownerKeys: [ORIGINAL_KEY],
      })
    ).toEqual([ORIGINAL_KEY]);
  });
});
