/**
 * Username and organization-slug claims are atomic (SETNX on the index key),
 * and organization writes are bounded (name length, metadata allowlist and
 * per-field caps, owned-org cap). Exercised through both runtimes: the Vercel
 * functions under api/ and the Fastify dev server.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();
const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => {
    const hit = store.delete(k) || sets.delete(k) || hashes.delete(k);
    return hit ? 1 : 0;
  },
  incr: async () => 1,
  sMembers: async k => (sets.has(k) ? [...setFor(k)] : []),
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sRem: async (k, ...m) => (
    m.flat().forEach(x => setFor(k).delete(String(x))),
    1
  ),
  sIsMember: async (k, m) => setFor(k).has(String(m)),
  hSet: async (k, obj) => {
    hashes.set(k, { ...(hashes.get(k) || {}), ...obj });
    return 1;
  },
  hGetAll: async k => ({ ...(hashes.get(k) || {}) }),
  hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
  hDel: async (k, ...f) => {
    const h = hashes.get(k);
    if (h) f.forEach(x => delete h[x]);
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

const apiUserStorage = require('../../../api/lib/user-storage');
const devUserStorage = require('../src/lib/user-storage');
const usernameHandler = require('../../../api/auth/username');
const orgsHandler = require('../../../api/v2/orgs/index');
const orgHandler = require('../../../api/v2/orgs/[orgId]');
const { buildServer } = require('../src/server');
const {
  validateOrgMetadata,
  MAX_OWNED_ORGS_PER_ACCOUNT,
} = require('../../../shared/org-validation');

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const ADMIN = 'ops@example.com';
const TOKENS = { [ALICE]: 'tok-alice', [BOB]: 'tok-bob', [ADMIN]: 'tok-ops' };

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  for (const [email, token] of Object.entries(TOKENS)) {
    store.set(`apitoken:${token}`, JSON.stringify({ email }));
  }
  setFor('admin:set').add(ADMIN);
}

function seedProfile(id, extra = {}) {
  store.set(
    `user:${id}`,
    JSON.stringify({ id, email: `${id}@example.com`, username: null, ...extra })
  );
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

async function callVercel(handler, { method, email, query = {}, body }) {
  const res = makeRes();
  await handler(
    {
      method,
      query,
      headers: email ? { authorization: `Bearer ${TOKENS[email]}` } : {},
      body,
    },
    res
  );
  return { status: res.statusCode, body: res.body };
}

let server;
beforeAll(async () => {
  server = await buildServer();
});
afterAll(async () => {
  if (server) await server.close();
});
beforeEach(() => seed());

describe.each([
  ['api/lib', apiUserStorage],
  ['backend/src/lib', devUserStorage],
])('%s claimUsername', (_where, { claimUsername, USERNAME_TOMBSTONE }) => {
  it('lets exactly one of two concurrent claims of the same name win', async () => {
    seedProfile('U1');
    seedProfile('U2');
    const results = await Promise.allSettled([
      claimUsername('U1', 'shared-name'),
      claimUsername('U2', 'shared-name'),
    ]);
    const won = results.filter(r => r.status === 'fulfilled');
    const lost = results.filter(r => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason.code).toBe('taken');

    const winner = won[0].value.id;
    const loser = winner === 'U1' ? 'U2' : 'U1';
    expect(store.get('username:shared-name')).toBe(winner);
    expect(JSON.parse(store.get(`user:${loser}`)).username).toBeNull();
  });

  it('refuses a second name without reserving it', async () => {
    seedProfile('U1');
    await claimUsername('U1', 'first-name');
    await expect(claimUsername('U1', 'second-name')).rejects.toMatchObject({
      code: 'immutable',
    });
    expect(store.get('username:first-name')).toBe('U1');
    expect(store.has('username:second-name')).toBe(false);
  });

  it('refuses a retired name and leaves its index untouched', async () => {
    seedProfile('U2');
    store.set('username:gone', USERNAME_TOMBSTONE);
    await expect(claimUsername('U2', 'gone')).rejects.toMatchObject({
      code: 'retired',
    });
    expect(store.get('username:gone')).toBe(USERNAME_TOMBSTONE);
  });

  it('finishes a claim whose index already points at the same user', async () => {
    seedProfile('U1');
    store.set('username:half-done', 'U1');
    const user = await claimUsername('U1', 'half-done');
    expect(user.username).toBe('half-done');
  });

  it('does not reserve the name for an unknown user', async () => {
    await expect(claimUsername('nobody', 'free-name')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(store.has('username:free-name')).toBe(false);
  });
});

describe('POST /api/auth/username error codes', () => {
  it('answers 404 (not 500) when the caller has no profile', async () => {
    const r = await callVercel(usernameHandler, {
      method: 'POST',
      email: ALICE,
      body: { username: 'alice' },
    });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('answers 409 (not 500) for a retired name', async () => {
    seedProfile(ALICE);
    store.set('username:gone', apiUserStorage.USERNAME_TOMBSTONE);
    const r = await callVercel(usernameHandler, {
      method: 'POST',
      email: ALICE,
      body: { username: 'gone' },
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('retired');
  });
});

async function fastify(method, url, email, payload) {
  const res = await server.inject({
    method,
    url,
    headers: email ? { authorization: `Bearer ${TOKENS[email]}` } : {},
    payload,
  });
  let body;
  try {
    body = res.json();
  } catch {
    body = undefined;
  }
  return { status: res.statusCode, body };
}

const runtimes = {
  vercel: {
    create: (email, body) =>
      callVercel(orgsHandler, { method: 'POST', email, body }),
    patch: (email, orgId, body) =>
      callVercel(orgHandler, {
        method: 'PATCH',
        email,
        query: { orgId },
        body,
      }),
    get: orgId => callVercel(orgHandler, { method: 'GET', query: { orgId } }),
    del: (email, orgId) =>
      callVercel(orgHandler, { method: 'DELETE', email, query: { orgId } }),
  },
  fastify: {
    create: (email, body) => fastify('POST', '/api/v2/orgs', email, body),
    patch: (email, orgId, body) =>
      fastify('PATCH', `/api/v2/orgs/${orgId}`, email, body),
    get: orgId => fastify('GET', `/api/v2/orgs/${orgId}`),
    del: (email, orgId) => fastify('DELETE', `/api/v2/orgs/${orgId}`, email),
  },
};

function seedOwnedOrgs(email, n) {
  for (let i = 0; i < n; i++) {
    const id = `owned-${i}`;
    store.set(`org:${id}`, JSON.stringify({ id, slug: id, name: id }));
    setFor(`member2orgs:${email}`).add(id);
    hashes.set(`org:${id}:roles`, { [email]: 'owner' });
  }
}

describe.each(Object.entries(runtimes))('%s: organizations', (_rt, rt) => {
  it('lets exactly one of two concurrent creates of a slug win', async () => {
    const [a, b] = await Promise.all([
      rt.create(ALICE, { name: 'Alice Org', slug: 'contested' }),
      rt.create(BOB, { name: 'Bob Org', slug: 'contested' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? ALICE : BOB;
    const loser = winner === ALICE ? BOB : ALICE;
    const org = JSON.parse(store.get('org:contested'));
    expect(org.name).toBe(winner === ALICE ? 'Alice Org' : 'Bob Org');
    expect(hashes.get('org:contested:roles')).toEqual({ [winner]: 'owner' });
    expect(setFor(`member2orgs:${loser}`).has('contested')).toBe(false);
  });

  it('refuses a slug that is already taken', async () => {
    expect((await rt.create(ALICE, { name: 'A', slug: 'taken' })).status).toBe(
      201
    );
    expect((await rt.create(BOB, { name: 'B', slug: 'taken' })).status).toBe(
      409
    );
    expect(hashes.get('org:taken:roles')).toEqual({ [ALICE]: 'owner' });
  });

  it('bounds the org name on create', async () => {
    const ok = await rt.create(ALICE, { name: 'n'.repeat(100), slug: 'ok' });
    expect(ok.status).toBe(201);
    const long = await rt.create(ALICE, { name: 'n'.repeat(101), slug: 'no' });
    expect(long.status).toBe(400);
    expect(store.has('org:no')).toBe(false);
    expect(store.has('org:by_slug:no')).toBe(false);
  });

  it(`caps orgs owned per account at ${MAX_OWNED_ORGS_PER_ACCOUNT}`, async () => {
    seedOwnedOrgs(ALICE, MAX_OWNED_ORGS_PER_ACCOUNT);
    const r = await rt.create(ALICE, { name: 'One more', slug: 'one-more' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('org_limit');
    expect(store.has('org:by_slug:one-more')).toBe(false);

    seedOwnedOrgs(ADMIN, MAX_OWNED_ORGS_PER_ACCOUNT);
    expect(
      (await rt.create(ADMIN, { name: 'Admin', slug: 'admin-extra' })).status
    ).toBe(201);
  });

  it('validates metadata and name on PATCH', async () => {
    await rt.create(ALICE, { name: 'Org', slug: 'meta' });

    const unknown = await rt.patch(ALICE, 'meta', {
      metadata: { website: 'https://a.example', logoHtml: '<b>x</b>' },
    });
    expect(unknown.status).toBe(400);

    const tooLong = await rt.patch(ALICE, 'meta', {
      metadata: { description: 'd'.repeat(501) },
    });
    expect(tooLong.status).toBe(400);

    const badEmail = await rt.patch(ALICE, 'meta', {
      metadata: { email: 'not-an-email' },
    });
    expect(badEmail.status).toBe(400);

    const badUrl = await rt.patch(ALICE, 'meta', {
      metadata: { website: 'javascript:alert(1)' },
    });
    expect(badUrl.status).toBe(400);

    const nonString = await rt.patch(ALICE, 'meta', {
      metadata: { github: { nested: true } },
    });
    expect(nonString.status).toBe(400);

    const longName = await rt.patch(ALICE, 'meta', { name: 'x'.repeat(101) });
    expect(longName.status).toBe(400);

    expect(JSON.parse(store.get('org:meta')).metadata).toBeUndefined();

    const ok = await rt.patch(ALICE, 'meta', {
      name: ' Renamed ',
      metadata: {
        description: ' hello ',
        website: 'https://a.example',
        email: 'team@a.example',
        github: 'https://github.com/a',
        twitter: '',
        location: 'Earth',
      },
    });
    expect(ok.status).toBe(200);
    const stored = JSON.parse(store.get('org:meta'));
    expect(stored.name).toBe('Renamed');
    expect(stored.metadata).toEqual({
      description: 'hello',
      website: 'https://a.example',
      email: 'team@a.example',
      github: 'https://github.com/a',
      location: 'Earth',
    });
  });

  it('still serves a stored org whose metadata has other keys', async () => {
    store.set(
      'org:legacy',
      JSON.stringify({
        id: 'legacy',
        slug: 'legacy',
        name: 'Legacy',
        metadata: { avatar: 'https://a.example/x.png', description: 'old' },
      })
    );
    store.set('org:by_slug:legacy', 'legacy');
    const r = await rt.get('legacy');
    expect(r.status).toBe(200);
    expect(r.body.metadata.avatar).toBe('https://a.example/x.png');
  });

  it('clears admin verification when the owner deletes the org', async () => {
    await rt.create(ALICE, { name: 'Org', slug: 'verified-org' });
    store.set('admin_verified:org:verified-org', '1');
    expect((await rt.del(ALICE, 'verified-org')).status).toBe(204);
    expect(store.has('admin_verified:org:verified-org')).toBe(false);
    expect(store.has('org:by_slug:verified-org')).toBe(false);

    // A new org under the same slug starts unverified.
    expect(
      (await rt.create(BOB, { name: 'New', slug: 'verified-org' })).status
    ).toBe(201);
    expect(store.has('admin_verified:org:verified-org')).toBe(false);
  });
});

describe('validateOrgMetadata', () => {
  it('treats null as clearing and drops empty values', () => {
    expect(validateOrgMetadata(null)).toEqual({ value: {} });
    expect(validateOrgMetadata({ website: '', email: null })).toEqual({
      value: {},
    });
  });

  it('refuses non-object metadata', () => {
    expect(validateOrgMetadata([]).error).toBeDefined();
    expect(validateOrgMetadata('x').error).toBeDefined();
  });
});
