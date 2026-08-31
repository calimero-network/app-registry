/**
 * Deleting and yanking used to compare only the manifest author, so an
 * organization owner could not remove a package their own org had published —
 * the delete button 403'd with "Only the package author can delete this
 * package." Publishing already honoured orgs (isAllowedToPublish), so the two
 * halves of the lifecycle disagreed.
 *
 * These lock in the permission rule for both runtimes: package author, an
 * admin/owner of the linked org, or a site admin — and nobody else, in
 * particular not a plain org member.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
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
  setNX: async () => true,
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

const deleted = [];
jest.mock('../src/lib/bundle-storage-kv', () => ({
  BundleStorageKV: class {
    async getBundleVersions() {
      return ['1.0.0'];
    }
    async getBundleManifest() {
      return {
        package: 'com.acme.widget',
        appVersion: '1.0.0',
        metadata: { author: 'author-user', _ownerEmail: 'author@acme.io' },
      };
    }
    async deletePackage(pkg) {
      deleted.push(pkg);
    }
  },
}));

const {
  createPackagePermissions,
} = require('@calimero-network/registry-shared/package-permissions');
const { getPkg2Org, isOrgAdminOrOwner } = require('../src/lib/org-storage');
const { isAdmin } = require('../src/lib/admin-storage');

let mockCurrentUser = null;
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return { ...actual, requireAuth: async () => mockCurrentUser };
});

const deleteHandler = require('../../../api/v2/bundles/[package]');

const PKG = 'com.acme.widget';
const ORG_ID = 'acme';

// isAdmin grants every @calimero.network address, so the non-admin fixtures
// deliberately sit on other domains.
const AUTHOR = { email: 'author@acme.io', username: 'author-user' };
const ORG_OWNER = { email: 'owner@acme.io', username: 'owner-user' };
const ORG_ADMIN = { email: 'admin@acme.io', username: 'admin-user' };
const ORG_MEMBER = { email: 'member@acme.io', username: 'member-user' };
const OUTSIDER = { email: 'nobody@example.com', username: 'nobody' };
const SITE_ADMIN = { email: 'staff@calimero.network', username: 'staff' };

const MANIFEST = {
  metadata: { author: 'author-user', _ownerEmail: 'author@acme.io' },
};

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  deleted.length = 0;
  store.set(`pkg2org:${PKG}`, ORG_ID);
  store.set(
    `org:${ORG_ID}`,
    JSON.stringify({ id: ORG_ID, name: 'Acme', slug: 'acme' })
  );
  sets.set(
    `org:${ORG_ID}:members`,
    new Set([ORG_OWNER.email, ORG_ADMIN.email, ORG_MEMBER.email])
  );
  hashes.set(`org:${ORG_ID}:roles`, {
    [ORG_OWNER.email]: 'owner',
    [ORG_ADMIN.email]: 'admin',
    [ORG_MEMBER.email]: 'member',
  });
}

beforeEach(() => seed());

describe('canManagePackage', () => {
  const { canManagePackage } = createPackagePermissions({
    getPkg2Org,
    isOrgManager: isOrgAdminOrOwner,
    isAdmin,
  });

  test.each([
    ['the package author', AUTHOR, true],
    ['an org owner', ORG_OWNER, true],
    ['an org admin', ORG_ADMIN, true],
    ['a site admin', SITE_ADMIN, true],
    ['a plain org member', ORG_MEMBER, false],
    ['an unrelated user', OUTSIDER, false],
  ])('%s -> %s', async (_label, user, expected) => {
    await expect(canManagePackage(PKG, MANIFEST, user)).resolves.toBe(expected);
  });

  test('an org owner of a different org cannot manage the package', async () => {
    store.set(`pkg2org:${PKG}`, 'some-other-org');
    await expect(canManagePackage(PKG, MANIFEST, ORG_OWNER)).resolves.toBe(
      false
    );
  });

  test('an unlinked package still falls back to author-only', async () => {
    store.delete(`pkg2org:${PKG}`);
    await expect(canManagePackage(PKG, MANIFEST, ORG_OWNER)).resolves.toBe(
      false
    );
    await expect(canManagePackage(PKG, MANIFEST, AUTHOR)).resolves.toBe(true);
  });
});

describe('DELETE /api/v2/bundles/:package', () => {
  function callDelete(user) {
    mockCurrentUser = user;
    const res = {
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
    return deleteHandler(
      { method: 'DELETE', query: { package: PKG }, headers: {} },
      res
    ).then(() => res);
  }

  afterEach(() => {
    mockCurrentUser = null;
  });

  test('an org owner can delete a package their org published', async () => {
    const res = await callDelete(ORG_OWNER);
    expect(res.statusCode).toBe(200);
    expect(deleted).toEqual([PKG]);
  });

  test('a plain org member still cannot', async () => {
    const res = await callDelete(ORG_MEMBER);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('not_owner');
    expect(deleted).toEqual([]);
  });

  test('the author can still delete', async () => {
    const res = await callDelete(AUTHOR);
    expect(res.statusCode).toBe(200);
    expect(deleted).toEqual([PKG]);
  });
});
