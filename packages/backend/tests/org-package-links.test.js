/**
 * Linking a package to an organization delegates publishing to that org's
 * admins; it does not transfer the package. These tests drive the Vercel
 * handlers with an in-memory KV and pin down that:
 *
 *  - the package owner (server-stamped `_ownerEmail`) can always unlink it, and
 *    move it to another org they administer, even after the current org
 *    removed them;
 *  - org admins/owners keep their existing unlink rights;
 *  - `org:{id}:packages` follows the link, so the public listing of the old
 *    org drops a moved package and deleting the old org leaves the new link
 *    alone.
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

const PKG = 'com.acme.app';

// isAdmin auto-grants @calimero.network, so fixtures sit on other domains.
const PKG_OWNER = { email: 'owner@acme.io', token: 'tok-pkg-owner' };
const ORG_OWNER = { email: 'boss@other.io', token: 'tok-org-owner' };
const ORG_ADMIN = { email: 'admin@other.io', token: 'tok-org-admin' };
const MEMBER = { email: 'member@other.io', token: 'tok-member' };
const STRANGER = { email: 'stranger@else.io', token: 'tok-stranger' };
const SITE_ADMIN = { email: 'mod@else.io', token: 'tok-site-admin' };

jest.mock('../src/lib/bundle-storage-kv', () => ({
  BundleStorageKV: class {
    async getBundleVersions() {
      return ['1.0.0'];
    }
    async getBundleManifest(pkg) {
      return {
        package: pkg,
        appVersion: '1.0.0',
        metadata: { _ownerEmail: 'owner@acme.io' },
      };
    }
  },
}));

const packagesHandler = require('../../../api/v2/orgs/[orgId]/packages/index');
const unlinkHandler = require('../../../api/v2/orgs/[orgId]/packages/[packageName]');
const memberHandler = require('../../../api/v2/orgs/[orgId]/members/[pubkey]');
const orgHandler = require('../../../api/v2/orgs/[orgId]');
const orgStorage = require('../../../api/lib/org-storage');
const backendOrgStorage = require('../src/lib/org-storage');

function reset() {
  store.clear();
  sets.clear();
  hashes.clear();
  for (const actor of [
    PKG_OWNER,
    ORG_OWNER,
    ORG_ADMIN,
    MEMBER,
    STRANGER,
    SITE_ADMIN,
  ]) {
    store.set(
      `apitoken:${actor.token}`,
      JSON.stringify({ email: actor.email, name: actor.email })
    );
  }
  sets.set('admin:set', new Set([SITE_ADMIN.email]));
}

function org(id, roles) {
  store.set(`org:${id}`, JSON.stringify({ id, name: id, slug: id }));
  store.set(`org:by_slug:${id}`, id);
  sets.set(`org:${id}:members`, new Set(Object.keys(roles)));
  hashes.set(`org:${id}:roles`, { ...roles });
}

function res() {
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

async function call(handler, req) {
  const r = res();
  await handler({ headers: {}, ...req }, r);
  return r;
}

const auth = actor => ({ authorization: `Bearer ${actor.token}` });

const link = (orgId, actor) =>
  call(packagesHandler, {
    method: 'POST',
    query: { orgId },
    headers: auth(actor),
    body: { package: PKG },
  });

const unlink = (orgId, actor) =>
  call(unlinkHandler, {
    method: 'DELETE',
    query: { orgId, packageName: PKG },
    headers: auth(actor),
  });

const list = orgId =>
  call(packagesHandler, { method: 'GET', query: { orgId } });

describe('unlinking a package from an organization', () => {
  beforeEach(() => {
    reset();
    org('other', {
      [ORG_OWNER.email]: 'owner',
      [ORG_ADMIN.email]: 'admin',
      [MEMBER.email]: 'member',
      [PKG_OWNER.email]: 'admin',
    });
  });

  test('the package owner can unlink after the org removed them', async () => {
    expect((await link('other', PKG_OWNER)).statusCode).toBe(204);
    const kick = await call(memberHandler, {
      method: 'DELETE',
      query: { orgId: 'other', pubkey: PKG_OWNER.email },
      headers: auth(ORG_OWNER),
    });
    expect(kick.statusCode).toBe(204);

    const r = await unlink('other', PKG_OWNER);
    expect(r.statusCode).toBe(204);
    expect(store.has(`pkg2org:${PKG}`)).toBe(false);
    expect((await list('other')).body.packages).toEqual([]);

    const perm = await orgStorage.resolvePublishPermission(
      { signature: { publicKey: 'owner-key' } },
      'admin-key',
      PKG,
      ORG_ADMIN.email
    );
    expect(perm.allowed).toBe(false);
  });

  test('an org admin who does not own the package can still unlink it', async () => {
    await orgStorage.setPkg2Org(PKG, 'other');
    const r = await unlink('other', ORG_ADMIN);
    expect(r.statusCode).toBe(204);
    expect(store.has(`pkg2org:${PKG}`)).toBe(false);
  });

  test('a site admin can unlink it', async () => {
    await orgStorage.setPkg2Org(PKG, 'other');
    const r = await unlink('other', SITE_ADMIN);
    expect(r.statusCode).toBe(204);
    expect(store.has(`pkg2org:${PKG}`)).toBe(false);
  });

  test('a plain member or an outsider cannot', async () => {
    await orgStorage.setPkg2Org(PKG, 'other');
    expect((await unlink('other', MEMBER)).statusCode).toBe(403);
    expect((await unlink('other', STRANGER)).statusCode).toBe(403);
    expect(store.get(`pkg2org:${PKG}`)).toBe('other');
  });

  test('the package owner gets 404 when the package is linked elsewhere', async () => {
    org('third', { [ORG_OWNER.email]: 'owner' });
    await orgStorage.setPkg2Org(PKG, 'third');
    const r = await unlink('other', PKG_OWNER);
    expect(r.statusCode).toBe(404);
    expect(store.get(`pkg2org:${PKG}`)).toBe('third');
  });

  test('an unauthenticated request is refused', async () => {
    await orgStorage.setPkg2Org(PKG, 'other');
    const r = await call(unlinkHandler, {
      method: 'DELETE',
      query: { orgId: 'other', packageName: PKG },
    });
    expect(r.statusCode).toBe(401);
    expect(store.get(`pkg2org:${PKG}`)).toBe('other');
  });
});

describe('moving a linked package to another organization', () => {
  beforeEach(() => {
    reset();
    org('other', { [ORG_OWNER.email]: 'owner' });
    org('mine', { [PKG_OWNER.email]: 'owner', [MEMBER.email]: 'member' });
    store.set(`pkg2org:${PKG}`, 'other');
    sets.set('org:other:packages', new Set([PKG]));
  });

  test('the package owner can move it to an org they administer', async () => {
    const r = await link('mine', PKG_OWNER);
    expect(r.statusCode).toBe(204);
    expect(store.get(`pkg2org:${PKG}`)).toBe('mine');
    expect((await list('other')).body.packages).toEqual([]);
    expect((await list('mine')).body.packages).toEqual([PKG]);

    const perm = await orgStorage.resolvePublishPermission(
      { signature: { publicKey: 'owner-key' } },
      'boss-key',
      PKG,
      ORG_OWNER.email
    );
    expect(perm.allowed).toBe(false);
  });

  test('not to an org where they are only a member', async () => {
    org('member-only', {
      [ORG_OWNER.email]: 'owner',
      [PKG_OWNER.email]: 'member',
    });
    const r = await link('member-only', PKG_OWNER);
    expect(r.statusCode).toBe(403);
    expect(store.get(`pkg2org:${PKG}`)).toBe('other');
  });

  test('deleting the previous org leaves the new link in place', async () => {
    expect((await link('mine', PKG_OWNER)).statusCode).toBe(204);
    const d = await call(orgHandler, {
      method: 'DELETE',
      query: { orgId: 'other' },
      headers: auth(ORG_OWNER),
    });
    expect(d.statusCode).toBe(204);
    expect(store.get(`pkg2org:${PKG}`)).toBe('mine');
    expect((await list('mine')).body.packages).toEqual([PKG]);
  });
});

describe('org package sets', () => {
  beforeEach(reset);

  test.each([
    ['api/lib', orgStorage],
    ['backend', backendOrgStorage],
  ])('%s setPkg2Org drops the package from the previous org', async (_, s) => {
    await s.setPkg2Org(PKG, 'a');
    await s.setPkg2Org(PKG, 'b');
    expect(await s.getPackagesByOrg('a')).toEqual([]);
    expect(await s.getPackagesByOrg('b')).toEqual([PKG]);
    await s.setPkg2Org(PKG, 'b');
    expect(await s.getPackagesByOrg('b')).toEqual([PKG]);
  });

  test.each([
    ['api/lib', orgStorage],
    ['backend', backendOrgStorage],
  ])('%s deleteOrg only removes links that still point at it', async (_, s) => {
    store.set(`pkg2org:${PKG}`, 'b');
    store.set('pkg2org:com.acme.mine', 'a');
    sets.set('org:a:packages', new Set([PKG, 'com.acme.mine']));
    await s.deleteOrg('a');
    expect(store.get(`pkg2org:${PKG}`)).toBe('b');
    expect(store.has('pkg2org:com.acme.mine')).toBe(false);
  });

  test('GET lists only packages whose link still points at the org', async () => {
    org('a', {});
    store.set(`pkg2org:${PKG}`, 'b');
    store.set('pkg2org:com.acme.mine', 'a');
    sets.set(
      'org:a:packages',
      new Set([PKG, 'com.acme.mine', 'com.acme.gone'])
    );
    const r = await list('a');
    expect(r.statusCode).toBe(200);
    expect(r.body.packages).toEqual(['com.acme.mine']);
  });
});
