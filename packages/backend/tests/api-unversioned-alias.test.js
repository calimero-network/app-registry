/**
 * `/api/<ns>/...` is the canonical API and `/api/v2/<ns>/...` a deprecated
 * alias of it — in both runtimes.
 *
 * Released clients still call the `v2` spelling: `meroctl` pushes to
 * `/api/v2/bundles/push`, the desktop app reads bundles, orgs, downloads and
 * asset URLs under `/api/v2`, and mdma's registry sync reads
 * `/api/v2/bundles?fresh=1`. Breaking either spelling breaks someone, so every
 * case here asserts both.
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
const {
  UNVERSIONED_NAMESPACES,
  DEPRECATION_HEADER,
  toServingUrl,
  isDeprecatedPath,
} = require('../src/lib/api-alias');

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

describe('the alias mapping', () => {
  test.each([
    ['/api/bundles', '/api/v2/bundles'],
    ['/api/bundles?fresh=1', '/api/v2/bundles?fresh=1'],
    ['/api/bundles/push', '/api/v2/bundles/push'],
    ['/api/orgs/acme/members', '/api/v2/orgs/acme/members'],
    ['/api/packages/p/assets/1/raw', '/api/v2/packages/p/assets/1/raw'],
    ['/api/downloads/record', '/api/v2/downloads/record'],
    ['/api/invitations', '/api/v2/invitations'],
  ])('%s is served by %s', (url, serving) => {
    expect(toServingUrl(url)).toBe(serving);
  });

  test.each([
    '/api/v2/bundles',
    '/api/healthz',
    '/api/stats',
    '/api/sitemap',
    '/api/auth/me',
    '/api/users/resolve',
    '/api/admin/review-queue',
    '/api/artifacts/p/1.0.0/app.wasm',
    '/api/bundlesx',
    '/bundles',
  ])('%s is left alone', url => {
    expect(toServingUrl(url)).toBe(url);
  });

  test('only the v2 spelling is deprecated', () => {
    expect(isDeprecatedPath('/api/v2/bundles')).toBe(true);
    expect(isDeprecatedPath('/api/v2/bundles?fresh=1')).toBe(true);
    expect(isDeprecatedPath('/api/bundles')).toBe(false);
    expect(isDeprecatedPath('/api/v2x')).toBe(false);
  });
});

describe('Fastify answers both spellings identically', () => {
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
    ['GET', '/bundles/com.example.missing/1.0.0'],
    ['GET', `/packages/${PKG}`],
    ['GET', `/packages/${PKG}/assets`],
    ['GET', '/packages/com.example.missing/assets/abc/raw'],
    ['GET', `/orgs?package=${PKG}`],
    ['GET', '/orgs/no-such-org'],
    ['GET', '/orgs/no-such-org/members'],
    ['GET', '/invitations'],
    ['POST', '/bundles/push'],
  ];

  test.each(cases)('%s /api%s', async (method, rest) => {
    const canonical = await server.inject({ method, url: `/api${rest}` });
    seed();
    const legacy = await server.inject({ method, url: `/api/v2${rest}` });

    // A missing route is Fastify's own 404 — make sure neither is that.
    expect(canonical.payload).not.toMatch(/"Route [A-Z]+:/);
    expect(legacy.statusCode).toBe(canonical.statusCode);
    expect(legacy.headers['content-type']).toBe(
      canonical.headers['content-type']
    );
    expect(legacy.payload).toBe(canonical.payload);
  });

  test('a real read is served at the canonical path', async () => {
    const res = await server.inject({ url: `/api/bundles/${PKG}/1.0.0` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).package).toBe(PKG);
  });

  test('only the v2 spelling carries the Deprecation header', async () => {
    const canonical = await server.inject({ url: '/api/bundles' });
    const legacy = await server.inject({ url: '/api/v2/bundles' });
    expect(canonical.headers.deprecation).toBeUndefined();
    expect(legacy.headers.deprecation).toBe(DEPRECATION_HEADER);
  });

  test('unrelated unversioned routes are untouched', async () => {
    const res = await server.inject({ url: '/api/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
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

function vercelRoute(urlPath, rewrites = vercel.rewrites) {
  const direct = resolveFile(urlPath);
  if (direct) return direct;
  for (const rule of rewrites) {
    const match = new RegExp(`^${rule.source}$`).exec(urlPath);
    if (!match) continue;
    const dest = rule.destination.replace(/\$(\d+)/g, (_, i) => match[i] ?? '');
    return resolveFile(dest);
  }
  return null;
}

describe('vercel.json serves both spellings from the same functions', () => {
  const aliasRules = vercel.rewrites.filter(r =>
    r.destination.startsWith('/api/v2/')
  );

  test('every /api rewrite source is a plain regex the simulation models', () => {
    for (const rule of vercel.rewrites.filter(r =>
      r.source.startsWith('/api')
    )) {
      expect(rule.source).not.toMatch(/:[a-z]/i);
    }
  });

  test('the alias rewrites name exactly the namespaces under api/v2', () => {
    const dirs = fs
      .readdirSync(path.join(API_DIR, 'v2'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
    expect([...UNVERSIONED_NAMESPACES].sort()).toEqual(dirs);

    expect(aliasRules).toHaveLength(2);
    for (const rule of aliasRules) {
      const group = /^\/api\/\(([^)]+)\)/.exec(rule.source);
      expect(group).not.toBeNull();
      expect(group[1].split('|').sort()).toEqual(dirs);
    }
  });

  test('the alias rewrites come before the /api catch-all', () => {
    const catchAll = vercel.rewrites.findIndex(r => r.source === '/api/(.*)');
    expect(catchAll).toBeGreaterThan(-1);
    for (const rule of aliasRules) {
      expect(vercel.rewrites.indexOf(rule)).toBeLessThan(catchAll);
    }
  });

  test('no file under api/ shadows an unversioned namespace', () => {
    for (const ns of UNVERSIONED_NAMESPACES) {
      expect(fs.existsSync(path.join(API_DIR, ns))).toBe(false);
      expect(fs.existsSync(path.join(API_DIR, `${ns}.js`))).toBe(false);
    }
  });

  test.each([
    '/bundles',
    '/bundles/push',
    '/bundles/push-file',
    '/bundles/upload-url',
    `/bundles/${PKG}`,
    `/bundles/${PKG}/1.0.0`,
    `/bundles/${PKG}/1.0.0/yank`,
    '/downloads/record',
    '/invitations',
    '/invitations/acme/accept',
    '/orgs',
    '/orgs/acme',
    '/orgs/acme/audit',
    '/orgs/acme/members',
    '/orgs/acme/members/alice',
    '/orgs/acme/invitations',
    '/orgs/acme/invitations/alice',
    '/orgs/acme/packages',
    `/orgs/acme/packages/${PKG}`,
    `/packages/${PKG}`,
    `/packages/${PKG}/visibility`,
    `/packages/${PKG}/assets`,
    `/packages/${PKG}/assets/abc`,
    `/packages/${PKG}/assets/abc/raw`,
  ])('/api%s and /api/v2%s reach the same function', rest => {
    const legacy = vercelRoute(`/api/v2${rest}`);
    expect(legacy).not.toBeNull();
    // The deployed clients' paths must not depend on the new rewrites.
    const withoutAlias = vercel.rewrites.filter(r => !aliasRules.includes(r));
    expect(vercelRoute(`/api/v2${rest}`, withoutAlias)).toBe(legacy);

    expect(vercelRoute(`/api${rest}`)).toBe(legacy);
  });

  test.each([
    ['/api/healthz', 'healthz.js'],
    ['/api/stats', 'stats.js'],
    ['/api/auth/me', 'auth/me.js'],
    ['/api/admin/review-queue', 'admin/review-queue.js'],
    [
      '/api/artifacts/p/1.0.0/app.wasm',
      'artifacts/[package]/[version]/[filename].js',
    ],
  ])('%s still reaches its own function', (url, file) => {
    expect(vercelRoute(url)).toBe(path.join(API_DIR, file));
  });

  test('the v2 spelling carries the Deprecation header', () => {
    const rule = vercel.headers.find(h => h.source === '/api/v2/(.*)');
    expect(rule).toBeDefined();
    const header = rule.headers.find(h => h.key === 'Deprecation');
    expect(header.value).toBe(DEPRECATION_HEADER);
  });
});
