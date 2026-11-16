/**
 * The registry API lives at `/api/<ns>/...`, in both runtimes, and nowhere
 * else. `/api/v2/...` was removed on 2026-11-16 as a hard cutover: it must
 * answer 404, not quietly keep working through a leftover rewrite or route.
 */

const fs = require('fs');
const path = require('path');

const store = new Map();
const sets = new Map();
const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  setNXEx: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
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
  sRem: async () => 0,
  sIsMember: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
  hDel: async () => 0,
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

const { buildServer } = require('../src/server');

const ROOT = path.resolve(__dirname, '../../..');
const API_DIR = path.join(ROOT, 'api');
const vercel = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')
);

const PKG = 'com.example.app';
const manifest = {
  version: '1.0',
  package: PKG,
  appVersion: '1.0.0',
  metadata: { name: 'App', description: 'An app.', author: 'someone' },
  owners: ['owner-key'],
  interfaces: { exports: [], uses: [] },
  wasm: { path: 'app.wasm', hash: 'a'.repeat(64), size: 10 },
  signature: { algorithm: 'ed25519', publicKey: 'owner-key', signature: 's' },
};

function seed() {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set([PKG]));
  sets.set(`bundle-versions:${PKG}`, new Set(['1.0.0']));
  store.set(`bundle:${PKG}/1.0.0`, JSON.stringify({ json: manifest }));
}

/** Fastify's own "no such route" answer, as opposed to a handler's 404. */
const NO_ROUTE = /"Route [A-Z]+:/;

describe('Fastify serves the API at /api and not at /api/v2', () => {
  let server;
  beforeAll(async () => {
    server = await buildServer();
  });
  afterAll(() => server.close());
  beforeEach(seed);

  const cases = [
    ['GET', '/bundles'],
    ['GET', '/bundles?fresh=1'],
    ['GET', `/bundles?package=${PKG}&all_versions=true`],
    ['GET', `/bundles/${PKG}/1.0.0`],
    ['GET', `/packages/${PKG}`],
    ['GET', `/packages/${PKG}/assets`],
    ['GET', '/packages/com.example.missing/assets/abc/raw'],
    ['GET', `/orgs?package=${PKG}`],
    ['GET', '/orgs/no-such-org'],
    ['GET', '/orgs/no-such-org/members'],
    ['GET', '/invitations'],
    ['POST', '/bundles/push'],
  ];

  test.each(cases)('%s /api%s has a route', async (method, rest) => {
    const res = await server.inject({ method, url: `/api${rest}` });
    expect(res.payload).not.toMatch(NO_ROUTE);
  });

  test.each(cases)('%s /api/v2%s is gone', async (method, rest) => {
    const res = await server.inject({ method, url: `/api/v2${rest}` });
    expect(res.statusCode).toBe(404);
    expect(res.payload).toMatch(NO_ROUTE);
  });

  test('a real read is served at /api', async () => {
    const res = await server.inject({ url: `/api/bundles/${PKG}/1.0.0` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).package).toBe(PKG);
    expect(res.headers.deprecation).toBeUndefined();
  });

  test('no registered route mentions v2', () => {
    expect(server.printRoutes({ commonPrefix: false })).not.toMatch(/\bv2\b/);
  });
});

/**
 * Vercel resolves a request against the function files first and consults
 * `rewrites` only when no file matches; the first matching rewrite wins and its
 * destination is resolved against the files again. This models exactly that,
 * for sources written as anchored regular expressions (which is all
 * vercel.json's /api rules use — asserted below, so a `:param` source fails
 * loudly here rather than being mis-simulated).
 */
function resolveFile(urlPath, dir = API_DIR, segments = null) {
  const segs = segments || urlPath.replace(/^\/api\/?/, '').split('/');
  const [head, ...tail] = segs;
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dynamic = entries.filter(e => /^\[[^\]]+\](\.js)?$/.test(e.name));
  const candidates = [
    ...entries.filter(e => e.name === head || e.name === `${head}.js`),
    ...dynamic,
  ];
  for (const entry of candidates) {
    const full = path.join(dir, entry.name);
    if (tail.length === 0) {
      if (entry.isFile() && entry.name.endsWith('.js')) return full;
      if (entry.isDirectory() && fs.existsSync(path.join(full, 'index.js'))) {
        return path.join(full, 'index.js');
      }
    } else if (entry.isDirectory()) {
      const found = resolveFile(urlPath, full, tail);
      if (found) return found;
    }
  }
  return null;
}

function vercelRoute(urlPath) {
  const direct = resolveFile(urlPath);
  if (direct) return direct;
  for (const rule of vercel.rewrites) {
    const match = new RegExp(`^${rule.source}$`).exec(urlPath);
    if (!match) continue;
    const dest = rule.destination.replace(/\$(\d+)/g, (_, i) => match[i] ?? '');
    return resolveFile(dest);
  }
  return null;
}

describe('Vercel serves the API at /api and not at /api/v2', () => {
  test('every /api rewrite source is a plain regex the simulation models', () => {
    for (const rule of vercel.rewrites.filter(r =>
      r.source.startsWith('/api')
    )) {
      expect(rule.source).not.toMatch(/:[a-z]/i);
    }
  });

  test('vercel.json mentions no v2 path', () => {
    expect(JSON.stringify(vercel)).not.toMatch(/\/v2\b/);
  });

  test('there is no api/v2 directory', () => {
    expect(fs.existsSync(path.join(API_DIR, 'v2'))).toBe(false);
  });

  test.each([
    ['/bundles', 'bundles/index.js'],
    ['/bundles/push', 'bundles/push.js'],
    ['/bundles/push-file', 'bundles/push-file.js'],
    ['/bundles/upload-url', 'bundles/upload-url.js'],
    [`/bundles/${PKG}`, 'bundles/[package].js'],
    [`/bundles/${PKG}/1.0.0`, 'bundles/[package]/[version].js'],
    [`/bundles/${PKG}/1.0.0/yank`, 'bundles/[package]/[version]/yank.js'],
    ['/downloads/record', 'downloads/record.js'],
    ['/invitations', 'invitations/index.js'],
    ['/invitations/acme/accept', 'invitations/[orgId]/[action].js'],
    ['/orgs', 'orgs/index.js'],
    ['/orgs/acme', 'orgs/[orgId].js'],
    ['/orgs/acme/audit', 'orgs/[orgId]/audit.js'],
    ['/orgs/acme/members', 'orgs/[orgId]/members/index.js'],
    ['/orgs/acme/members/alice', 'orgs/[orgId]/members/[pubkey].js'],
    ['/orgs/acme/invitations', 'orgs/[orgId]/invitations/index.js'],
    ['/orgs/acme/invitations/alice', 'orgs/[orgId]/invitations/[username].js'],
    ['/orgs/acme/packages', 'orgs/[orgId]/packages/index.js'],
    [`/orgs/acme/packages/${PKG}`, 'orgs/[orgId]/packages/[packageName].js'],
    [`/packages/${PKG}`, 'packages/[package]/index.js'],
    [`/packages/${PKG}/visibility`, 'packages/[package]/visibility.js'],
    [`/packages/${PKG}/assets`, 'packages/[package]/assets/index.js'],
    [
      `/packages/${PKG}/assets/abc`,
      'packages/[package]/assets/[assetId]/index.js',
    ],
    [
      `/packages/${PKG}/assets/abc/raw`,
      'packages/[package]/assets/[assetId]/raw.js',
    ],
    ['/healthz', 'healthz.js'],
    ['/stats', 'stats.js'],
    ['/auth/me', 'auth/me.js'],
    ['/admin/review-queue', 'admin/review-queue.js'],
    [
      '/artifacts/p/1.0.0/app.wasm',
      'artifacts/[package]/[version]/[filename].js',
    ],
  ])(
    '/api%s reaches %s, and its /api/v2 spelling reaches nothing',
    (rest, file) => {
      expect(vercelRoute(`/api${rest}`)).toBe(path.join(API_DIR, file));
      expect(vercelRoute(`/api/v2${rest}`)).toBeNull();
    }
  );
});
