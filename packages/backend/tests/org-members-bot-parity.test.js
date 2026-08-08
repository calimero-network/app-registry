/**
 * GET /api/v2/orgs/:orgId/members exists twice: as the deployed Vercel function
 * (api/v2/orgs/[orgId]/members/index.js) and on the Fastify server for
 * Docker/self-hosted. The org UI hides the remove-member risk behind the isBot
 * flag, so both must report it or self-hosted admins lose the warning.
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

const vercelHandler = require('../../../api/v2/orgs/[orgId]/members/index');
const { buildServer } = require('../src/server');

const ORG_ID = 'acme';
const BOT = 'ci@acme.io';
const HUMAN = 'alice@calimero.network';

function seed() {
  store.clear();
  sets.clear();
  hashes.clear();
  store.set(
    `org:${ORG_ID}`,
    JSON.stringify({ id: ORG_ID, name: 'Acme', slug: 'acme' })
  );
  sets.set(`org:${ORG_ID}:members`, new Set([BOT, HUMAN]));
  hashes.set(`org:${ORG_ID}:roles`, { [BOT]: 'member', [HUMAN]: 'owner' });
  sets.set('bot:set', new Set([BOT]));
}

async function callVercel() {
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
  await vercelHandler(
    { method: 'GET', query: { orgId: ORG_ID }, headers: {} },
    res
  );
  return res.body;
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => seed());

async function callFastify() {
  const response = await server.inject({
    method: 'GET',
    url: `/api/v2/orgs/${ORG_ID}/members`,
  });
  return JSON.parse(response.payload);
}

test('both runtimes flag the bot member and only the bot member', async () => {
  const byEmail = body =>
    Object.fromEntries(body.members.map(m => [m.email, m.isBot]));

  const expected = { [BOT]: true, [HUMAN]: false };
  expect(byEmail(await callVercel())).toEqual(expected);
  expect(byEmail(await callFastify())).toEqual(expected);
});
