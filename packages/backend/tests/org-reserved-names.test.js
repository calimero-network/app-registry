/**
 * Org display names naming Calimero are admin-only, like slugs
 * (org-reserved-slugs.test.js), in both runtimes. The name is what an
 * invitation shows, so a look-alike spelling must be caught too.
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

const orgsIndex = require('../../../api/v2/orgs/index');
const orgHandler = require('../../../api/v2/orgs/[orgId]');
const membersIndex = require('../../../api/v2/orgs/[orgId]/members/index');
const myInvitations = require('../../../api/v2/invitations/index');
const { buildServer } = require('../src/server');
const {
  isReservedOrgName,
  normalizeOrgName,
} = require('../../../shared/org-slugs');
const {
  MAX_PENDING_INVITATIONS_PER_ORG,
} = require('../../../shared/org-invitation-flow');

const USER = { email: 'carol@example.com', token: 'user-token' };
const ADMIN = { email: 'ops@example.com', token: 'admin-token' };
const INVITEE = { email: 'dave@example.com', token: 'invitee-token' };

const RESERVED_VARIANTS = [
  'Calimero Network',
  'CALIMERO',
  'Ca1imero',
  'Calimero​',
  'Ｃａｌｉｍｅｒｏ',
  'Cal‍imero Labs',
  'Саlimero',
  'Caliméro',
  'The CALIRNERO team',
];

function user(id, { email, token }, username) {
  store.set(`apitoken:${token}`, JSON.stringify({ email, name: email }));
  store.set(`user:${id}`, JSON.stringify({ id, email, username }));
  store.set(`email2user:${email}`, id);
  store.set(`username:${username}`, id);
}

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  user('u1', USER, 'carol');
  user('u2', ADMIN, 'ops');
  user('u3', INVITEE, 'dave');
  sets.set('admin:set', new Set([ADMIN.email]));
}

function org(id, name, roles) {
  store.set(`org:${id}`, JSON.stringify({ id, name, slug: id }));
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
  await handler({ headers: {}, query: {}, ...req }, r);
  return { status: r.statusCode, body: r.body };
}

const auth = actor => ({ authorization: `Bearer ${actor.token}` });

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => seed());

const vercel = {
  create: (actor, body) =>
    call(orgsIndex, { method: 'POST', headers: auth(actor), body }),
  patch: (actor, orgId, body) =>
    call(orgHandler, {
      method: 'PATCH',
      query: { orgId },
      headers: auth(actor),
      body,
    }),
};

async function inject(method, url, actor, payload) {
  const r = await server.inject({
    method,
    url,
    headers: auth(actor),
    payload,
  });
  return { status: r.statusCode, body: r.json() };
}

const fastify = {
  create: (actor, body) => inject('POST', '/api/v2/orgs', actor, body),
  patch: (actor, orgId, body) =>
    inject('PATCH', `/api/v2/orgs/${orgId}`, actor, body),
};

describe.each([
  ['vercel', vercel],
  ['fastify', fastify],
])('%s: org display names', (_runtime, api) => {
  it.each(RESERVED_VARIANTS)(
    'refuses to create %j for a non-admin',
    async name => {
      const r = await api.create(USER, { name, slug: 'cn-official' });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('reserved_name');
      expect(store.has('org:cn-official')).toBe(false);
    }
  );

  it('lets a site admin create one', async () => {
    const r = await api.create(ADMIN, {
      name: 'Calimero Network',
      slug: 'cn-official',
    });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Calimero Network');
  });

  it('accepts ordinary names and stores them normalised', async () => {
    const r = await api.create(USER, {
      name: '  Acme​   Apps ',
      slug: 'acme',
    });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Acme Apps');
    expect(JSON.parse(store.get('org:acme')).name).toBe('Acme Apps');
  });

  it('refuses a name made only of invisible characters', async () => {
    const r = await api.create(USER, { name: '​‍', slug: 'acme' });
    expect(r.status).toBe(400);
  });

  it.each(RESERVED_VARIANTS)(
    'refuses to rename an org to %j for a non-admin',
    async name => {
      org('acme', 'Acme', { [USER.email]: 'owner' });
      const r = await api.patch(USER, 'acme', { name });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('reserved_name');
      expect(JSON.parse(store.get('org:acme')).name).toBe('Acme');
    }
  );

  it('lets a site admin who administers the org rename it', async () => {
    org('acme', 'Acme', { [ADMIN.email]: 'owner' });
    const r = await api.patch(ADMIN, 'acme', { name: 'Calimero Labs' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Calimero Labs');
  });

  it('lets the trusted calimero-network org keep its name', async () => {
    org('calimero-network', 'Calimero', { [USER.email]: 'owner' });
    const r = await api.patch(USER, 'calimero-network', {
      name: 'Calimero Network',
    });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Calimero Network');
  });

  it('leaves an existing org with such a name untouched', async () => {
    org('legacy', 'Calimero Fans', { [USER.email]: 'owner' });
    const r = await api.patch(USER, 'legacy', {
      name: 'Calimero Fans',
      metadata: { description: 'hi' },
    });
    expect(r.status).toBe(200);
    expect(JSON.parse(store.get('org:legacy')).name).toBe('Calimero Fans');
  });

  it('allows an ordinary rename', async () => {
    org('acme', 'Acme', { [USER.email]: 'owner' });
    const r = await api.patch(USER, 'acme', { name: 'Acme Labs' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Acme Labs');
  });
});

describe('reads of an existing org', () => {
  it('returns the stored name as it is', async () => {
    org('legacy', 'Calimero​ Network', { [USER.email]: 'owner' });
    const r = await call(orgHandler, {
      method: 'GET',
      query: { orgId: 'legacy' },
    });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Calimero​ Network');
    expect(JSON.parse(store.get('org:legacy')).name).toBe('Calimero​ Network');
  });

  it('lists an invitation with the slug beside the name', async () => {
    org('legacy', 'Calimero Network', { [USER.email]: 'owner' });
    const inv = await call(membersIndex, {
      method: 'POST',
      query: { orgId: 'legacy' },
      headers: auth(USER),
      body: { username: 'dave', role: 'admin' },
    });
    expect(inv.status).toBe(202);
    const r = await call(myInvitations, {
      method: 'GET',
      headers: auth(INVITEE),
    });
    expect(r.status).toBe(200);
    expect(r.body.invitations[0].org).toEqual({
      id: 'legacy',
      name: 'Calimero Network',
      slug: 'legacy',
    });
  });
});

describe('pending invitation cap', () => {
  it(`refuses more than ${MAX_PENDING_INVITATIONS_PER_ORG} pending invitations per org`, async () => {
    org('acme', 'Acme', { [USER.email]: 'owner' });
    const now = new Date().toISOString();
    const pending = {};
    for (let i = 0; i < MAX_PENDING_INVITATIONS_PER_ORG; i++) {
      pending[`p${i}@example.com`] = JSON.stringify({
        role: 'member',
        invitedBy: USER.email,
        createdAt: now,
      });
    }
    hashes.set('org_invites:acme', pending);
    const r = await call(membersIndex, {
      method: 'POST',
      query: { orgId: 'acme' },
      headers: auth(USER),
      body: { username: 'dave', role: 'member' },
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('invitation_limit');
    expect(hashes.get('org_invites:acme')[INVITEE.email]).toBeUndefined();

    delete hashes.get('org_invites:acme')['p0@example.com'];
    const ok = await call(membersIndex, {
      method: 'POST',
      query: { orgId: 'acme' },
      headers: auth(USER),
      body: { username: 'dave', role: 'member' },
    });
    expect(ok.status).toBe(202);
  });
});

describe('isReservedOrgName', () => {
  it.each(RESERVED_VARIANTS)('matches %j', name => {
    expect(isReservedOrgName(name)).toBe(true);
  });

  it.each(['Acme', 'Kalimera', 'Mero Labs', 'Cal Imer', '', undefined])(
    'does not match %j',
    name => {
      expect(isReservedOrgName(name)).toBe(false);
    }
  );

  it('normalises width, invisible characters and whitespace', () => {
    expect(normalizeOrgName('  Ａcme​   Apps﻿ ')).toBe('Acme Apps');
  });
});
