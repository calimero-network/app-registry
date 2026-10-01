/**
 * Organization membership by invitation: adding a username creates a pending
 * invitation the invitee accepts or declines. Drives the Vercel handlers and
 * the Fastify server against the same in-memory Redis stand-in.
 */

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => {
    const had = store.delete(k) || sets.delete(k) || hashes.delete(k);
    return had ? 1 : 0;
  },
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
  hDel: async (k, ...f) => {
    if (!hashes.has(k)) return 0;
    let n = 0;
    f.flat().forEach(x => {
      if (x in hashes.get(k)) {
        delete hashes.get(k)[x];
        n++;
      }
    });
    return n;
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

const membersHandler = require('../../../api/v2/orgs/[orgId]/members/index');
const memberHandler = require('../../../api/v2/orgs/[orgId]/members/[pubkey]');
const orgInvitesHandler = require('../../../api/v2/orgs/[orgId]/invitations/index');
const revokeHandler = require('../../../api/v2/orgs/[orgId]/invitations/[username]');
const myInvitesHandler = require('../../../api/v2/invitations/index');
const respondHandler = require('../../../api/v2/invitations/[orgId]/[action]');
const { deleteOrg } = require('../../../api/lib/org-storage');
const {
  createOrgInvitations,
  INVITATION_TTL_MS,
} = require('@calimero-network/registry-shared/org-invitations');
const { buildServer } = require('../src/server');

const ORG = 'acme';
const OWNER = { email: 'owner@acme.io', token: 'tok-owner', username: 'owner' };
const ADMIN = {
  email: 'admin@acme.io',
  token: 'tok-admin',
  username: 'admin1',
};
const ALICE = {
  email: 'alice@example.io',
  token: 'tok-alice',
  username: 'alice',
};
const EVE = { email: 'eve@example.io', token: 'tok-eve', username: 'eve' };
const BOT = { email: 'ci@acme.io', token: 'tok-bot', username: 'acme-ci' };

function seedUser({ email, token, username }, extra = {}) {
  const id = `id-${username}`;
  store.set(`apitoken:${token}`, JSON.stringify({ email, name: username }));
  store.set(`user:${id}`, JSON.stringify({ id, email, username, ...extra }));
  store.set(`email2user:${email}`, id);
  store.set(`username:${username}`, id);
}

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  store.set(`org:${ORG}`, JSON.stringify({ id: ORG, name: 'Acme', slug: ORG }));
  sets.set(`org:${ORG}:members`, new Set([OWNER.email, ADMIN.email]));
  hashes.set(`org:${ORG}:roles`, {
    [OWNER.email]: 'owner',
    [ADMIN.email]: 'admin',
  });
  [OWNER, ADMIN, ALICE, EVE].forEach(u => seedUser(u));
  seedUser(BOT, { botOrg: ORG });
  sets.set('bot:set', new Set([BOT.email]));
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

async function call(handler, method, actor, query = {}, body) {
  const r = res();
  await handler(
    {
      method,
      query,
      headers: actor ? { authorization: `Bearer ${actor.token}` } : {},
      body,
    },
    r
  );
  return r;
}

const invite = (actor, username, role) =>
  call(membersHandler, 'POST', actor, { orgId: ORG }, { username, role });
const respond = (actor, action, orgId = ORG) =>
  call(respondHandler, 'POST', actor, { orgId, action });
const roleOf = email => hashes.get(`org:${ORG}:roles`)?.[email] ?? null;
const isMember = email => sets.get(`org:${ORG}:members`)?.has(email) ?? false;

beforeEach(() => seed());

describe('inviting a member', () => {
  test('creates a pending invitation and does not add the member', async () => {
    const r = await invite(ADMIN, '@Alice');
    expect(r.statusCode).toBe(202);
    expect(r.body).toMatchObject({
      status: 'invited',
      invitation: { username: 'alice', role: 'member' },
    });
    expect(isMember(ALICE.email)).toBe(false);
    expect(roleOf(ALICE.email)).toBeNull();
  });

  test('a second invitation for the same user is refused', async () => {
    await invite(ADMIN, 'alice');
    const r = await invite(ADMIN, 'alice');
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('already_invited');
  });

  test('an existing member cannot be invited', async () => {
    const r = await invite(OWNER, 'admin1');
    expect(r.statusCode).toBe(409);
  });

  test('only an owner can invite an admin', async () => {
    expect((await invite(ADMIN, 'alice', 'admin')).statusCode).toBe(403);
    expect((await invite(OWNER, 'alice', 'admin')).statusCode).toBe(202);
  });

  test('a non-member cannot invite', async () => {
    expect((await invite(EVE, 'alice')).statusCode).toBe(403);
  });

  test('a bot of this org is added directly; another org cannot add it', async () => {
    const r = await invite(OWNER, 'acme-ci');
    expect(r.statusCode).toBe(204);
    expect(isMember(BOT.email)).toBe(true);

    store.set(
      'org:other',
      JSON.stringify({ id: 'other', name: 'Other', slug: 'other' })
    );
    sets.set('org:other:members', new Set([EVE.email]));
    hashes.set('org:other:roles', { [EVE.email]: 'owner' });
    const r2 = await call(
      membersHandler,
      'POST',
      EVE,
      { orgId: 'other' },
      { username: 'acme-ci' }
    );
    expect(r2.statusCode).toBe(403);
    expect(sets.get('org:other:members').has(BOT.email)).toBe(false);
  });
});

describe('responding to an invitation', () => {
  test('the invitee lists it and accepting adds them with the invited role', async () => {
    await invite(OWNER, 'alice', 'admin');

    const mine = await call(myInvitesHandler, 'GET', ALICE);
    expect(mine.statusCode).toBe(200);
    expect(mine.body.invitations).toEqual([
      expect.objectContaining({
        org: { id: ORG, name: 'Acme', slug: ORG },
        role: 'admin',
        invitedBy: 'owner',
      }),
    ]);
    expect(JSON.stringify(mine.body)).not.toContain('@');

    const r = await respond(ALICE, 'accept');
    expect(r.statusCode).toBe(204);
    expect(isMember(ALICE.email)).toBe(true);
    expect(roleOf(ALICE.email)).toBe('admin');
    expect(
      (await call(myInvitesHandler, 'GET', ALICE)).body.invitations
    ).toEqual([]);
  });

  test('declining discards it without adding the member', async () => {
    await invite(ADMIN, 'alice');
    expect((await respond(ALICE, 'decline')).statusCode).toBe(204);
    expect(isMember(ALICE.email)).toBe(false);
    expect((await respond(ALICE, 'accept')).statusCode).toBe(404);
  });

  test('someone who was not invited cannot accept', async () => {
    await invite(ADMIN, 'alice');
    expect((await respond(EVE, 'accept')).statusCode).toBe(404);
    expect(isMember(EVE.email)).toBe(false);
  });

  test('an unknown action is refused', async () => {
    await invite(ADMIN, 'alice');
    expect((await respond(ALICE, 'join')).statusCode).toBe(400);
  });

  test('responding requires login', async () => {
    expect((await respond(null, 'accept')).statusCode).toBe(401);
  });
});

describe('managing pending invitations', () => {
  test('org admins see pending invitations by username only', async () => {
    await invite(ADMIN, 'alice');
    const r = await call(orgInvitesHandler, 'GET', ADMIN, { orgId: ORG });
    expect(r.statusCode).toBe(200);
    expect(r.body.invitations).toEqual([
      expect.objectContaining({
        username: 'alice',
        role: 'member',
        invitedBy: 'admin1',
      }),
    ]);
    expect(JSON.stringify(r.body)).not.toContain('@');
  });

  test('outsiders cannot list pending invitations', async () => {
    await invite(ADMIN, 'alice');
    const r = await call(orgInvitesHandler, 'GET', EVE, { orgId: ORG });
    expect(r.statusCode).toBe(403);
  });

  test('a revoked invitation can no longer be accepted', async () => {
    await invite(ADMIN, 'alice');
    const r = await call(revokeHandler, 'DELETE', ADMIN, {
      orgId: ORG,
      username: 'alice',
    });
    expect(r.statusCode).toBe(204);
    expect((await respond(ALICE, 'accept')).statusCode).toBe(404);
  });

  test('deleting the org removes its invitations', async () => {
    await invite(ADMIN, 'alice');
    await deleteOrg(ORG);
    expect(hashes.has(`org_invites:${ORG}`)).toBe(false);
    expect(sets.get(`user_org_invites:${ALICE.email}`)?.has(ORG)).toBeFalsy();
  });

  test('an invitation expires', async () => {
    const inv = createOrgInvitations(mockKv);
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    await inv.create(ORG, ALICE.email, { role: 'member' }, t0);
    expect(await inv.get(ORG, ALICE.email, t0 + 1000)).not.toBeNull();
    expect(await inv.get(ORG, ALICE.email, t0 + INVITATION_TTL_MS)).toBeNull();
    expect(await inv.listForEmail(ALICE.email, t0)).toEqual([]);
  });
});

describe('member management by username', () => {
  test('an owner removes a member by username', async () => {
    await invite(ADMIN, 'alice');
    await respond(ALICE, 'accept');
    const r = await call(memberHandler, 'DELETE', OWNER, {
      orgId: ORG,
      pubkey: 'alice',
    });
    expect(r.statusCode).toBe(204);
    expect(isMember(ALICE.email)).toBe(false);
  });

  test('an owner changes a role by username', async () => {
    const r = await call(
      memberHandler,
      'PATCH',
      OWNER,
      { orgId: ORG, pubkey: 'admin1' },
      { role: 'member' }
    );
    expect(r.statusCode).toBe(204);
    expect(roleOf(ADMIN.email)).toBe('member');
  });

  test('an unknown username is a 404', async () => {
    const r = await call(memberHandler, 'DELETE', OWNER, {
      orgId: ORG,
      pubkey: 'nobody',
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('Fastify server parity', () => {
  let server;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  const inject = (method, url, actor, payload) =>
    server.inject({
      method,
      url,
      headers: actor ? { authorization: `Bearer ${actor.token}` } : {},
      payload,
    });

  test('invite, list, accept', async () => {
    const r = await inject('POST', `/api/v2/orgs/${ORG}/members`, ADMIN, {
      username: 'alice',
    });
    expect(r.statusCode).toBe(202);
    expect(isMember(ALICE.email)).toBe(false);

    const pending = await inject(
      'GET',
      `/api/v2/orgs/${ORG}/invitations`,
      ADMIN
    );
    expect(JSON.parse(pending.payload).invitations).toHaveLength(1);

    const mine = await inject('GET', '/api/v2/invitations', ALICE);
    expect(JSON.parse(mine.payload).invitations).toHaveLength(1);

    const accepted = await inject(
      'POST',
      `/api/v2/invitations/${ORG}/accept`,
      ALICE
    );
    expect(accepted.statusCode).toBe(204);
    expect(roleOf(ALICE.email)).toBe('member');
  });

  test('members see only their own email', async () => {
    const r = await inject('GET', `/api/v2/orgs/${ORG}/members`, ADMIN);
    const withEmail = JSON.parse(r.payload).members.filter(m => 'email' in m);
    expect(withEmail.map(m => m.email)).toEqual([ADMIN.email]);
  });

  test('revoke and remove by username', async () => {
    await inject('POST', `/api/v2/orgs/${ORG}/members`, ADMIN, {
      username: 'alice',
    });
    const revoked = await inject(
      'DELETE',
      `/api/v2/orgs/${ORG}/invitations/alice`,
      ADMIN
    );
    expect(revoked.statusCode).toBe(204);

    const removed = await inject(
      'DELETE',
      `/api/v2/orgs/${ORG}/members/admin1`,
      OWNER
    );
    expect(removed.statusCode).toBe(204);
    expect(isMember(ADMIN.email)).toBe(false);
  });
});
