/**
 * Regression tests for three organization authorization gaps in the deployed
 * Vercel functions (api/v2/orgs/...). Each maps to a concrete privilege
 * escalation the handlers previously allowed:
 *
 *  1. RE-LINK STEAL — linking a package already owned by another org overwrote
 *     the link, so a package author could yank an org-owned package into their
 *     own org and strip the real org's admins.
 *  2. ADMIN REMOVES OWNER — DELETE let any admin remove owners/admins; an admin
 *     could evict the owners and seize the org. Only an owner may now remove a
 *     privileged member.
 *  3. GHOST ADMIN — PATCH wrote a role for a target absent from the members set,
 *     minting an admin the member list never shows. A role change for a
 *     non-member is now refused.
 *
 * These drive the real handlers with a functional in-memory KV so the storage
 * writes (or their absence) are observable.
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

// The package handler resolves the bundle to confirm the caller owns it.
jest.mock('../src/lib/bundle-storage-kv', () => ({
  BundleStorageKV: class {
    async getBundleVersions() {
      return ['1.0.0'];
    }
    async getBundleManifest() {
      return {
        package: 'com.acme.widget',
        appVersion: '1.0.0',
        metadata: { author: 'author-user', _ownerEmail: 'author@evil.io' },
      };
    }
  },
}));

const packagesHandler = require('../../../api/v2/orgs/[orgId]/packages/index');
const memberHandler = require('../../../api/v2/orgs/[orgId]/members/[pubkey]');

const PKG = 'com.acme.widget';

// isAdmin auto-grants @calimero.network, so org actors sit on other domains.
const AUTHOR = { email: 'author@evil.io', token: 'tok-author' };
const OWNER = { email: 'owner@acme.io', token: 'tok-owner' };
const OWNER2 = { email: 'owner2@acme.io', token: 'tok-owner2' };
const ADMIN = { email: 'admin@acme.io', token: 'tok-admin' };
const ADMIN2 = { email: 'admin2@acme.io', token: 'tok-admin2' };
const MEMBER = { email: 'member@acme.io', token: 'tok-member' };

function seedApiToken({ email, token }) {
  store.set(`apitoken:${token}`, JSON.stringify({ email, name: email }));
}

function reset() {
  store.clear();
  sets.clear();
  hashes.clear();
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

async function postPackage(orgId, actor, pkg) {
  const r = res();
  await packagesHandler(
    {
      method: 'POST',
      query: { orgId },
      headers: { authorization: `Bearer ${actor.token}` },
      body: { package: pkg },
    },
    r
  );
  return r;
}

async function deleteMember(orgId, actor, targetEmail) {
  const r = res();
  await memberHandler(
    {
      method: 'DELETE',
      query: { orgId, pubkey: targetEmail },
      headers: { authorization: `Bearer ${actor.token}` },
    },
    r
  );
  return r;
}

async function patchMember(orgId, actor, targetEmail, role) {
  const r = res();
  await memberHandler(
    {
      method: 'PATCH',
      query: { orgId, pubkey: targetEmail },
      headers: { authorization: `Bearer ${actor.token}` },
      body: { role },
    },
    r
  );
  return r;
}

function setOrg(orgId) {
  store.set(
    `org:${orgId}`,
    JSON.stringify({ id: orgId, name: orgId, slug: orgId })
  );
}

function setMembers(orgId, roleByEmail) {
  sets.set(`org:${orgId}:members`, new Set(Object.keys(roleByEmail)));
  hashes.set(`org:${orgId}:roles`, { ...roleByEmail });
}

describe('#1 re-link steal: link package already owned by another org', () => {
  beforeEach(() => {
    reset();
    seedApiToken(AUTHOR);
    // The author owns the manifest and owns their own "attacker-org".
    setOrg('attacker-org');
    setMembers('attacker-org', { [AUTHOR.email]: 'owner' });
    // A real org (victim-org) currently owns the package; the author is NOT a
    // member of it.
    setOrg('victim-org');
    setMembers('victim-org', { [OWNER.email]: 'owner' });
    store.set(`pkg2org:${PKG}`, 'victim-org');
  });

  test('is refused (409) and the existing link is preserved', async () => {
    const r = await postPackage('attacker-org', AUTHOR, PKG);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('conflict');
    expect(store.get(`pkg2org:${PKG}`)).toBe('victim-org');
  });

  test('is allowed (204) when the package is unlinked', async () => {
    store.delete(`pkg2org:${PKG}`);
    const r = await postPackage('attacker-org', AUTHOR, PKG);
    expect(r.statusCode).toBe(204);
    expect(store.get(`pkg2org:${PKG}`)).toBe('attacker-org');
  });

  test('is allowed (204) when the caller also controls the current org', async () => {
    // Author is made an admin of victim-org, so moving the link is legitimate.
    setMembers('victim-org', {
      [OWNER.email]: 'owner',
      [AUTHOR.email]: 'admin',
    });
    const r = await postPackage('attacker-org', AUTHOR, PKG);
    expect(r.statusCode).toBe(204);
    expect(store.get(`pkg2org:${PKG}`)).toBe('attacker-org');
  });
});

describe('linking requires the server-stamped owner, not the author name', () => {
  // An account whose USERNAME equals the package's display author, but whose
  // email is not the stamped _ownerEmail. The author string names nobody.
  const NAMESAKE = { email: 'namesake@example.com', token: 'tok-namesake' };

  beforeEach(() => {
    reset();
    seedApiToken(NAMESAKE);
    store.set(`email2user:${NAMESAKE.email}`, 'u-namesake');
    store.set(
      'user:u-namesake',
      JSON.stringify({
        id: 'u-namesake',
        email: NAMESAKE.email,
        username: 'author-user',
      })
    );
    setOrg('namesake-org');
    setMembers('namesake-org', { [NAMESAKE.email]: 'owner' });
  });

  test('a username matching metadata.author cannot link the package', async () => {
    const r = await postPackage('namesake-org', NAMESAKE, PKG);
    expect(r.statusCode).toBe(403);
    expect(store.has(`pkg2org:${PKG}`)).toBe(false);
  });

  test('the stamped owner can, with the email in any case', async () => {
    const MIXED = { email: 'Author@Evil.IO', token: 'tok-author-mixed' };
    seedApiToken(MIXED);
    setMembers('namesake-org', {
      [NAMESAKE.email]: 'owner',
      [MIXED.email]: 'admin',
    });
    const r = await postPackage('namesake-org', MIXED, PKG);
    expect(r.statusCode).toBe(204);
    expect(store.get(`pkg2org:${PKG}`)).toBe('namesake-org');
  });
});

describe('#2 removing owners/admins requires owner', () => {
  const ORG = 'acme';
  beforeEach(() => {
    reset();
    [OWNER, OWNER2, ADMIN, ADMIN2, MEMBER].forEach(seedApiToken);
    setOrg(ORG);
    setMembers(ORG, {
      [OWNER.email]: 'owner',
      [OWNER2.email]: 'owner',
      [ADMIN.email]: 'admin',
      [ADMIN2.email]: 'admin',
      [MEMBER.email]: 'member',
    });
  });

  test('an admin cannot remove an owner', async () => {
    const r = await deleteMember(ORG, ADMIN, OWNER.email);
    expect(r.statusCode).toBe(403);
    expect(sets.get(`org:${ORG}:members`).has(OWNER.email)).toBe(true);
  });

  test('an admin cannot remove a fellow admin', async () => {
    const r = await deleteMember(ORG, ADMIN, ADMIN2.email);
    expect(r.statusCode).toBe(403);
    expect(sets.get(`org:${ORG}:members`).has(ADMIN2.email)).toBe(true);
  });

  test('an admin can remove a plain member', async () => {
    const r = await deleteMember(ORG, ADMIN, MEMBER.email);
    expect(r.statusCode).toBe(204);
    expect(sets.get(`org:${ORG}:members`).has(MEMBER.email)).toBe(false);
  });

  test('an owner can remove an admin', async () => {
    const r = await deleteMember(ORG, OWNER, ADMIN.email);
    expect(r.statusCode).toBe(204);
    expect(sets.get(`org:${ORG}:members`).has(ADMIN.email)).toBe(false);
  });

  test('an owner can remove another owner when one remains', async () => {
    const r = await deleteMember(ORG, OWNER, OWNER2.email);
    expect(r.statusCode).toBe(204);
    expect(sets.get(`org:${ORG}:members`).has(OWNER2.email)).toBe(false);
  });
});

describe('#3 ghost admin: role change for a non-member', () => {
  const ORG = 'acme';
  const STRANGER = 'stranger@evil.io';
  beforeEach(() => {
    reset();
    seedApiToken(OWNER);
    setOrg(ORG);
    setMembers(ORG, {
      [OWNER.email]: 'owner',
      [MEMBER.email]: 'member',
    });
  });

  test('is refused (404) and no role is written for the non-member', async () => {
    const r = await patchMember(ORG, OWNER, STRANGER, 'admin');
    expect(r.statusCode).toBe(404);
    expect(hashes.get(`org:${ORG}:roles`)[STRANGER]).toBeUndefined();
  });

  test('a role change for a real member still succeeds', async () => {
    const r = await patchMember(ORG, OWNER, MEMBER.email, 'admin');
    expect(r.statusCode).toBe(204);
    expect(hashes.get(`org:${ORG}:roles`)[MEMBER.email]).toBe('admin');
  });
});
