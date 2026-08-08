/**
 * Public Read Endpoint Tests
 *
 * Behavioural coverage for the unauthenticated endpoints the frontend, the CLI
 * and mero-react actually call. These had no tests, so a change to the Redis
 * key layout or a storage helper could break them with the suite still green.
 *
 * Everything here runs against an in-memory Redis stand-in, so it stays in the
 * default `pnpm test` run rather than needing a live node.
 */

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
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

const healthzHandler = require('../../../api/healthz');
const statsHandler = require('../../../api/stats');
const recordHandler = require('../../../api/v2/downloads/record');
const listHandler = require('../../../api/v2/bundles/index');

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    headers: {},
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
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

function seed(packages) {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set(Object.keys(packages)));
  for (const [pkg, versions] of Object.entries(packages)) {
    sets.set(`bundle-versions:${pkg}`, new Set(Object.keys(versions)));
    for (const [version, meta] of Object.entries(versions)) {
      store.set(
        `bundle:${pkg}/${version}`,
        JSON.stringify({
          json: {
            package: pkg,
            appVersion: version,
            metadata: { author: meta.author },
            signature: { pubkey: meta.pubkey },
          },
          created_at: '2026-01-01T00:00:00.000Z',
        })
      );
    }
  }
}

beforeEach(() => {
  store.clear();
  sets.clear();
});

describe('GET /api/healthz', () => {
  test('reports ok with a timestamp', async () => {
    const res = makeRes();
    await healthzHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });
});

describe('GET /api/stats', () => {
  test('counts versions, packages and distinct developers', async () => {
    seed({
      'com.a.one': {
        '1.0.0': { author: 'alice', pubkey: 'pk-alice' },
        '2.0.0': { author: 'alice', pubkey: 'pk-alice' },
      },
      'com.b.two': { '1.0.0': { author: 'bob', pubkey: 'pk-bob' } },
    });

    const res = makeRes();
    await statsHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.publishedBundles).toBe(3); // every version
    expect(res.body.uniquePackages).toBe(2);
    expect(res.body.publishedApps).toBe(2);
    expect(res.body.activeDevelopers).toBe(2);
  });

  test('reports zeroes on an empty registry rather than failing', async () => {
    const res = makeRes();
    await statsHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.publishedBundles).toBe(0);
    expect(res.body.uniquePackages).toBe(0);
  });
});

describe('POST /api/v2/downloads/record', () => {
  test('increments the global and per-package counters', async () => {
    const res = makeRes();
    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: { package: 'com.a.one' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, package: 'com.a.one' });
    expect(store.get('downloads:total')).toBe('1');
    expect(store.get('downloads:com.a.one')).toBe('1');
  });

  test('canonicalises the package name to lowercase', async () => {
    // The listing endpoint reads downloads:<lowercase>, so a mixed-case write
    // here would silently strand the count.
    const res = makeRes();
    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: { package: 'Com.A.One' },
      },
      res
    );

    expect(res.body.package).toBe('com.a.one');
    expect(store.get('downloads:com.a.one')).toBe('1');
  });

  test('rejects a missing or malformed package name', async () => {
    for (const body of [{}, { package: '' }, { package: 'bad name!' }]) {
      const res = makeRes();
      await recordHandler(
        { method: 'POST', query: {}, headers: {}, body },
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    }
  });

  test('rejects non-POST', async () => {
    const res = makeRes();
    await recordHandler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('download counts surface in the listing', () => {
  test('a recorded download appears on the bundle', async () => {
    // End-to-end across two handlers and the canonical-casing rule above.
    seed({ 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk-alice' } } });

    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: { package: 'com.a.one' },
      },
      makeRes()
    );
    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: { package: 'com.a.one' },
      },
      makeRes()
    );

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].downloads).toBe(2);
  });

  test('a bundle with no downloads reports 0, not undefined', async () => {
    seed({ 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk-alice' } } });

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].downloads).toBe(0);
  });
});

describe('listing sanitization', () => {
  test('internal metadata never leaks to clients', async () => {
    sets.set('bundles:all', new Set(['com.a.one']));
    sets.set('bundle-versions:com.a.one', new Set(['1.0.0']));
    store.set(
      'bundle:com.a.one/1.0.0',
      JSON.stringify({
        json: {
          package: 'com.a.one',
          appVersion: '1.0.0',
          metadata: {
            author: 'alice',
            _ownerEmail: 'alice@example.com',
            _adminVerified: true,
          },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].metadata._ownerEmail).toBeUndefined();
    expect(res.body[0].metadata._adminVerified).toBeUndefined();
    expect(res.body[0].metadata.author).toBe('alice');
    // The private flag is still reflected in the public boolean.
    expect(res.body[0].verified).toBe(true);
  });

  test('a calimero.network owner is marked verified', async () => {
    sets.set('bundles:all', new Set(['com.a.one']));
    sets.set('bundle-versions:com.a.one', new Set(['1.0.0']));
    store.set(
      'bundle:com.a.one/1.0.0',
      JSON.stringify({
        json: {
          package: 'com.a.one',
          appVersion: '1.0.0',
          metadata: { author: 'alice', _ownerEmail: 'alice@calimero.network' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].verified).toBe(true);
    expect(res.body[0].metadata._ownerEmail).toBeUndefined();
  });

  test('an unknown owner is not verified', async () => {
    sets.set('bundles:all', new Set(['com.a.one']));
    sets.set('bundle-versions:com.a.one', new Set(['1.0.0']));
    store.set(
      'bundle:com.a.one/1.0.0',
      JSON.stringify({
        json: {
          package: 'com.a.one',
          appVersion: '1.0.0',
          metadata: { author: 'mallory', _ownerEmail: 'mallory@example.com' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].verified).toBe(false);
  });

  test('min_runtime_version is always present in both spellings', async () => {
    seed({ 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk' } } });

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].min_runtime_version).toBe('0.1.0');
    expect(res.body[0].minRuntimeVersion).toBe('0.1.0');
  });
});

describe('empty registry', () => {
  test('the listing returns an empty array, not an error', async () => {
    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});
