/**
 * Listings carry every package, so they leave the app guide out; the detail
 * endpoints a client opens for one version still return it.
 */

const store = new Map();
const sets = new Map();

const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async () => 1,
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sMembers: async k => [...setFor(k)],
  sIsMember: async (k, m) => setFor(k).has(m),
  sRem: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
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
// The Vercel detail handler opens its own Redis client when REDIS_URL is set.
jest.mock('redis', () => ({
  createClient: () => ({
    on() {},
    connect: async () => {},
    get: async k => mockKv.get(k),
  }),
}));
process.env.REDIS_URL = 'redis://guide-listing-test';

const listHandler = require('../../../api/v2/bundles/index');
const detailHandler = require('../../../api/v2/bundles/[package]/[version]');
const packageDetailHandler = require('../../../api/v2/packages/[package]/index');
const { buildServer } = require('../src/server');

const PKG = 'com.example.guided';
const GUIDE = '## Overview\nA guided app.';

beforeEach(() => {
  store.clear();
  sets.clear();
  setFor('bundles:all').add(PKG);
  setFor(`bundle-versions:${PKG}`).add('1.0.0');
  store.set(
    `bundle:${PKG}/1.0.0`,
    JSON.stringify({
      json: {
        package: PKG,
        appVersion: '1.0.0',
        metadata: { name: 'Guided', author: 'alice', guide: GUIDE },
        signature: { pubkey: 'pk-alice' },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
});

afterAll(() => {
  delete process.env.REDIS_URL;
});

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

async function callVercel(handler, query) {
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
  await handler({ method: 'GET', query, headers: {} }, res);
  return res.body;
}

async function callFastify(url) {
  return JSON.parse((await server.inject({ method: 'GET', url })).payload);
}

describe.each([
  ['browse', {}, ''],
  ['one package', { package: PKG }, `?package=${PKG}`],
  [
    'every version',
    { package: PKG, all_versions: 'true' },
    `?package=${PKG}&all_versions=true`,
  ],
])('the %s listing', (_name, query, qs) => {
  test('omits metadata.guide on Vercel', async () => {
    const [bundle] = await callVercel(listHandler, query);
    expect(bundle.metadata.name).toBe('Guided');
    expect(bundle.metadata).not.toHaveProperty('guide');
  });

  test('omits metadata.guide on Fastify', async () => {
    const [bundle] = await callFastify(`/api/v2/bundles${qs}`);
    expect(bundle.metadata.name).toBe('Guided');
    expect(bundle.metadata).not.toHaveProperty('guide');
  });
});

describe('one version', () => {
  test('keeps metadata.guide on Vercel GET /api/v2/bundles/:package/:version', async () => {
    const bundle = await callVercel(detailHandler, {
      package: PKG,
      version: '1.0.0',
    });
    expect(bundle.metadata.guide).toBe(GUIDE);
  });

  test('keeps metadata.guide on Vercel GET /api/v2/bundles?package&version', async () => {
    const [bundle] = await callVercel(listHandler, {
      package: PKG,
      version: '1.0.0',
    });
    expect(bundle.metadata.guide).toBe(GUIDE);
  });

  test('keeps metadata.guide on Fastify GET /api/v2/bundles/:package/:version', async () => {
    const bundle = await callFastify(`/api/v2/bundles/${PKG}/1.0.0`);
    expect(bundle.metadata.guide).toBe(GUIDE);
  });

  test('keeps metadata.guide on GET /api/v2/packages/:package', async () => {
    const body = await callVercel(packageDetailHandler, { package: PKG });
    expect(body.metadata.guide).toBe(GUIDE);
  });
});
