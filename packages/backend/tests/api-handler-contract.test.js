/**
 * API Handler Contract Tests
 *
 * These sweep EVERY serverless handler under `api/` — the surface actually
 * deployed to Vercel — rather than a hand-picked few. Most of that surface had
 * no test at all, so a broken `require`, a renamed export or a handler that
 * throws on an unexpected method only showed up as a 500 in production.
 *
 * Scope note: CORS is deliberately NOT asserted per handler. It is supplied at
 * the platform layer by the `/api/(.*)` headers block in vercel.json (verified
 * against production: /api/healthz sets no CORS in code yet still answers with
 * `access-control-allow-origin: *`). Handlers that also set it in code are
 * belt-and-braces. The config block itself is pinned in api-config.test.js.
 *
 * What is asserted here holds for every handler regardless of its method
 * contract, so the sweep cannot rot as endpoint behaviour evolves. Per-endpoint
 * behaviour lives in api-read-endpoints.test.js.
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.resolve(__dirname, '../../../api');

// Shared in-memory Redis stand-in. The sweep should rarely reach it, but a
// handler that does must not blow up on a missing connection.
const memory = new Map();
const memorySets = new Map();
const mockKv = {
  get: async k => (memory.has(k) ? memory.get(k) : null),
  set: async (k, v) => (memory.set(k, v), 'OK'),
  del: async k => (memory.delete(k) ? 1 : 0),
  incr: async k => {
    const next = (parseInt(memory.get(k) ?? '0', 10) || 0) + 1;
    memory.set(k, String(next));
    return next;
  },
  sMembers: async k => (memorySets.has(k) ? [...memorySets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!memorySets.has(k)) memorySets.set(k, new Set());
    m.flat().forEach(x => memorySets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async () => 0,
  sIsMember: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
  hDel: async () => 0,
  setNX: async () => true,
  scanKeys: async () => [],
};

jest.mock('../../../packages/backend/src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));
jest.mock('../../../api/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

/** Recursively collect every handler module (api/lib/* are helpers, not routes). */
function collectHandlers(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lib' && dir === API_DIR) continue;
      collectHandlers(full, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

const HANDLERS = collectHandlers(API_DIR).map(file => ({
  file,
  route: `/${path.relative(path.dirname(API_DIR), file).replace(/\.js$/, '')}`,
}));

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    ended: false,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      if (this.statusCode === null) this.statusCode = 200;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    redirect(code, url) {
      this.statusCode = typeof code === 'number' ? code : 302;
      this.body = typeof code === 'number' ? url : code;
      return this;
    },
  };
}

function load(file) {
  const mod = require(file);
  return typeof mod === 'function' ? mod : mod.default;
}

describe('API handler contract', () => {
  test('the sweep actually found the deployed handlers', () => {
    // Guards against a silently empty sweep if the layout ever moves.
    expect(HANDLERS.length).toBeGreaterThanOrEqual(25);
  });

  describe.each(HANDLERS)('$route', ({ file }) => {
    test('module loads and exports a request handler', () => {
      // Catches broken requires and renamed exports. Vercel discovers handlers
      // at runtime, so these fail as a hard 500 in production, never at build.
      expect(typeof load(file)).toBe('function');
    });

    test('OPTIONS preflight neither throws nor 5xxes', async () => {
      const res = makeRes();
      await expect(
        load(file)(
          { method: 'OPTIONS', query: {}, headers: {}, body: null },
          res
        )
      ).resolves.not.toThrow();

      expect(res.statusCode).not.toBeNull();
      expect(res.statusCode).toBeLessThan(500);
    });

    test('an unexpected method neither throws nor 5xxes', async () => {
      // Method contracts differ across the surface (some 405, some ignore the
      // method, auth-guarded ones 401 first). All of those are fine; crashing
      // or hanging is not.
      const res = makeRes();
      await expect(
        load(file)({ method: 'TRACE', query: {}, headers: {}, body: null }, res)
      ).resolves.not.toThrow();

      expect(res.statusCode).not.toBeNull();
      expect(res.statusCode).toBeLessThan(500);
    });

    test('a body-less POST neither throws nor 5xxes', async () => {
      // Vercel hands `undefined` body through when a client posts no payload;
      // a handler that destructures it blindly 500s.
      const res = makeRes();
      await expect(
        load(file)(
          { method: 'POST', query: {}, headers: {}, body: undefined },
          res
        )
      ).resolves.not.toThrow();

      expect(res.statusCode).not.toBeNull();
      expect(res.statusCode).toBeLessThan(500);
    });
  });
});
