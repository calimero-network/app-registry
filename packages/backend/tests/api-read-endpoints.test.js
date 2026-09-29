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
  setNXEx: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
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

const healthzHandler = require('../../../api/healthz');
const statsHandler = require('../../../api/stats');
const recordHandler = require('../../../api/v2/downloads/record');
const listHandler = require('../../../api/v2/bundles/index');
const orgHandler = require('../../../api/v2/orgs/[orgId]');
const packageHandler = require('../../../api/v2/packages/[package]/index');

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
  const ONE = { 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk' } } };

  function record(body, headers = {}) {
    const res = makeRes();
    return recordHandler(
      { method: 'POST', query: {}, headers, body },
      res
    ).then(() => res);
  }

  test('increments the global and per-package counters', async () => {
    seed(ONE);
    const res = await record({ package: 'com.a.one' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, package: 'com.a.one' });
    expect(store.get('downloads:total')).toBe('1');
    expect(store.get('downloads:com.a.one')).toBe('1');
  });

  test('canonicalises the package name to lowercase', async () => {
    // The listing endpoint reads downloads:<lowercase>, so a mixed-case write
    // here would silently strand the count.
    seed(ONE);
    const res = await record({ package: 'Com.A.One' });

    expect(res.body.package).toBe('com.a.one');
    expect(store.get('downloads:com.a.one')).toBe('1');
  });

  test('rejects a missing or malformed package name', async () => {
    for (const body of [
      {},
      { package: '' },
      { package: 'bad name!' },
      { package: 'nodots' },
      { package: `com.${'a'.repeat(300)}` },
    ]) {
      const res = await record(body);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    }
    expect(store.size).toBe(0);
  });

  test('rejects a malformed version', async () => {
    seed(ONE);
    for (const version of ['v1', '1.0', 42, '01.0.0']) {
      const res = await record({ package: 'com.a.one', version });
      expect(res.statusCode).toBe(400);
    }
    expect(store.get('downloads:total')).toBeUndefined();
  });

  test('an unknown package is not counted and creates no key', async () => {
    const res = await record({ package: 'com.never.published' });

    expect(res.statusCode).toBe(404);
    expect(store.has('downloads:com.never.published')).toBe(false);
    expect(store.has('downloads:total')).toBe(false);
  });

  test('an unknown version of a known package is not counted', async () => {
    seed(ONE);
    const res = await record({ package: 'com.a.one', version: '9.9.9' });

    expect(res.statusCode).toBe(404);
    expect(store.get('downloads:com.a.one')).toBeUndefined();
  });

  test('counts a known version', async () => {
    seed(ONE);
    const res = await record({ package: 'com.a.one', version: '1.0.0' });

    expect(res.statusCode).toBe(200);
    expect(store.get('downloads:com.a.one')).toBe('1');
  });

  test('refuses an oversized body', async () => {
    seed(ONE);
    const res = await record(
      { package: 'com.a.one' },
      { 'content-length': '5000' }
    );

    expect(res.statusCode).toBe(413);
    expect(store.get('downloads:total')).toBeUndefined();
  });

  test('counts one client once per package, but distinct clients separately', async () => {
    seed(ONE);
    const a = { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' };
    const b = { 'x-forwarded-for': '203.0.113.2' };

    for (const headers of [a, a, a, b]) {
      const res = await record({ package: 'com.a.one' }, headers);
      // Repeats still succeed; they are just not counted again.
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, package: 'com.a.one' });
    }

    expect(store.get('downloads:com.a.one')).toBe('2');
    expect(store.get('downloads:total')).toBe('2');
  });

  test('falls back to x-real-ip and never stores the raw address', async () => {
    seed(ONE);
    await record({ package: 'com.a.one' }, { 'x-real-ip': '198.51.100.7' });
    await record({ package: 'com.a.one' }, { 'x-real-ip': '198.51.100.7' });

    expect(store.get('downloads:com.a.one')).toBe('1');
    expect([...store.keys()].some(k => k.includes('198.51.100.7'))).toBe(false);
  });

  test('a storage failure answers a generic 500', async () => {
    seed(ONE);
    const spy = jest
      .spyOn(mockKv, 'incr')
      .mockRejectedValueOnce(new Error('WRONGTYPE Operation against a key'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await record({ package: 'com.a.one' });
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        error: 'internal_error',
        message: 'Internal error',
      });
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
  });

  test('rejects non-POST', async () => {
    const res = makeRes();
    await recordHandler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('server errors do not expose internals', () => {
  async function failingGet(handler, query) {
    const spy = jest
      .spyOn(mockKv, 'get')
      .mockRejectedValue(
        new Error('WRONGTYPE Operation against a key holding the wrong kind')
      );
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = makeRes();
      await handler({ method: 'GET', query, headers: {} }, res);
      return res;
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
  }

  test('GET /api/v2/orgs/:orgId', async () => {
    const res = await failingGet(orgHandler, { orgId: 'foo:members' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: 'internal_error',
      message: 'Internal error',
    });
  });

  test('GET /api/v2/packages/:package', async () => {
    seed({ 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk' } } });
    const res = await failingGet(packageHandler, { package: 'com.a.one' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: 'internal_error',
      message: 'Internal error',
    });
  });
});

describe('download counts surface in the listing', () => {
  test('a recorded download appears on the bundle', async () => {
    // End-to-end across two handlers and the canonical-casing rule above.
    seed({ 'com.a.one': { '1.0.0': { author: 'alice', pubkey: 'pk-alice' } } });

    // Two distinct clients: one client is counted once per window.
    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: { 'x-forwarded-for': '203.0.113.1' },
        body: { package: 'com.a.one' },
      },
      makeRes()
    );
    await recordHandler(
      {
        method: 'POST',
        query: {},
        headers: { 'x-forwarded-for': '203.0.113.2' },
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
    // ⚠️ SECURITY REGRESSION: `_adminVerified` in the manifest must NOT confer
    // the badge. The manifest is publisher-signed, so honouring it let a
    // publisher grant their own "verified". `verified` comes only from an admin
    // decision on record; this package has none and its owner
    // (alice@example.com) is not a trusted publisher, so it is NOT verified.
    expect(res.body[0].verified).toBe(false);
  });

  test('a calimero.network owner is trusted, so the package is verified too', async () => {
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

    // ⚠️ THIS ASSERTION HAS MOVED TWICE, AND THE REASONS ARE DIFFERENT.
    // Originally `verified` was true merely BECAUSE of the domain — the two
    // claims were one field, so every bundle was verified and the badge said
    // nothing. Splitting them made this false. It is true again now, but by a
    // rule rather than a coincidence: an unreviewed package from a trusted
    // publisher is approved on arrival, because the queue exists to stop
    // strangers publishing rubbish, not to make the people who build this
    // thing queue behind their own gate. The two fields are still separate —
    // see the next test, where a package IS verified and its publisher is
    // not.
    expect(res.body[0].verified).toBe(true);
    expect(res.body[0].publisherVerified).toBe(true);
    expect(res.body[0].metadata._ownerEmail).toBeUndefined();
  });

  test('an outside publisher is NOT verified until somebody decides', async () => {
    // The half the shortcut must not touch: default deny for everyone else.
    sets.set('bundles:all', new Set(['com.c.three']));
    sets.set('bundle-versions:com.c.three', new Set(['1.0.0']));
    store.set(
      'bundle:com.c.three/1.0.0',
      JSON.stringify({
        json: {
          package: 'com.c.three',
          appVersion: '1.0.0',
          metadata: { author: 'carol', _ownerEmail: 'carol@example.com' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].verified).toBe(false);
    expect(res.body[0].publisherVerified).toBe(false);
  });

  test('an admin decision verifies the package, whoever published it', async () => {
    // The other half of the split: a package by a publisher nobody has
    // verified can still be a verified package.
    sets.set('bundles:all', new Set(['com.b.two']));
    sets.set('bundle-versions:com.b.two', new Set(['1.0.0']));
    store.set(
      'bundle:com.b.two/1.0.0',
      JSON.stringify({
        json: {
          package: 'com.b.two',
          appVersion: '1.0.0',
          metadata: { author: 'bob', _ownerEmail: 'bob@example.com' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );
    store.set('admin_verified:package:com.b.two', '1');

    const res = makeRes();
    await listHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body[0].verified).toBe(true);
    expect(res.body[0].publisherVerified).toBe(false);
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
