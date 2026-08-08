/**
 * Bundle Listing Batching Tests
 *
 * GET /api/v2/bundles used to await twice per package inside a `for` loop, so a
 * 50-package registry cost 101 serialised Redis round trips (~9.6s against a
 * cross-region Redis). These tests pin the property that actually matters: the
 * number of *sequential* round trips must not grow with the number of packages.
 *
 * `waves` below counts round trips directly. Every mock command parks on a
 * timer, so commands issued in the same tick overlap and count as one wave —
 * exactly what node-redis pipelining does on the wire. Serialised awaits go
 * idle between each command and so count as one wave apiece.
 */

const PACKAGE_COUNT = 50;

let waves;
let inFlight;

/** Wrap a mock command so concurrent issues collapse into a single wave. */
function tracked(fn) {
  return async (...args) => {
    if (inFlight === 0) waves++;
    inFlight++;
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      return fn(...args);
    } finally {
      inFlight--;
    }
  };
}

const store = new Map();
const sets = new Map();

const mockKv = {
  get: tracked(key => (store.has(key) ? store.get(key) : null)),
  sMembers: tracked(key => (sets.has(key) ? [...sets.get(key)] : [])),
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

const listHandler = require('../../../api/v2/bundles/index');

function manifest(pkg, version, extra = {}) {
  return JSON.stringify({
    json: {
      package: pkg,
      appVersion: version,
      metadata: { author: `author-${pkg}` },
      signature: { pubkey: `pubkey-${pkg}` },
      ...extra,
    },
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

function seedRegistry() {
  store.clear();
  sets.clear();
  const packages = Array.from(
    { length: PACKAGE_COUNT },
    (_, i) => `com.example.pkg${String(i).padStart(3, '0')}`
  );
  sets.set('bundles:all', new Set(packages));
  for (const pkg of packages) {
    sets.set(`bundle-versions:${pkg}`, new Set(['1.0.0', '1.2.0', '1.10.0']));
    for (const v of ['1.0.0', '1.2.0', '1.10.0']) {
      store.set(`bundle:${pkg}/${v}`, manifest(pkg, v));
    }
  }
  return packages;
}

function makeReqRes(query = {}) {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
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
  return [{ method: 'GET', query, headers: {} }, res];
}

describe('GET /api/v2/bundles batching', () => {
  beforeEach(() => {
    waves = 0;
    inFlight = 0;
    seedRegistry();
  });

  test('round trips stay constant as package count grows', async () => {
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(PACKAGE_COUNT);

    // 3 to resolve manifests + 2 for the sanitize/downloads fan-out. The old
    // serialised loop alone cost 1 + 2*50 = 101.
    expect(waves).toBeLessThanOrEqual(8);
  });

  test('returns only the latest version per package, semver-ordered', async () => {
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    // 1.10.0 > 1.2.0 — a lexicographic sort would wrongly pick 1.2.0.
    expect(new Set(res.body.map(b => b.appVersion))).toEqual(
      new Set(['1.10.0'])
    );
    const names = res.body.map(b => b.package);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('all_versions returns every version, newest first, with yank flags', async () => {
    store.set('bundle-yanked:com.example.pkg000/1.2.0', '1');
    const [req, res] = makeReqRes({
      package: 'com.example.pkg000',
      all_versions: 'true',
    });
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.map(b => b.appVersion)).toEqual([
      '1.10.0',
      '1.2.0',
      '1.0.0',
    ]);
    expect(res.body.map(b => b.yanked)).toEqual([false, true, false]);
    expect(waves).toBeLessThanOrEqual(8);
  });

  test('developer and author filters still apply', async () => {
    const [devReq, devRes] = makeReqRes({
      developer: 'pubkey-com.example.pkg007',
    });
    await listHandler(devReq, devRes);
    expect(devRes.body.map(b => b.package)).toEqual(['com.example.pkg007']);

    const [authorReq, authorRes] = makeReqRes({
      author: 'author-com.example.pkg009',
    });
    await listHandler(authorReq, authorRes);
    expect(authorRes.body.map(b => b.package)).toEqual(['com.example.pkg009']);
  });

  test('drops packages whose manifest is missing', async () => {
    store.delete('bundle:com.example.pkg003/1.10.0');
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    // Falls out of the listing rather than surfacing a null entry.
    expect(res.body).toHaveLength(PACKAGE_COUNT - 1);
    expect(res.body.map(b => b.package)).not.toContain('com.example.pkg003');
  });
});

describe('GET /api/v2/bundles caching', () => {
  beforeEach(() => {
    waves = 0;
    inFlight = 0;
    seedRegistry();
  });

  test('successful listings are CDN-cacheable', async () => {
    const [req, res] = makeReqRes();
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(
      'public, s-maxage=60, stale-while-revalidate=86400'
    );
  });

  test('a single bundle lookup is cacheable', async () => {
    const [req, res] = makeReqRes({
      package: 'com.example.pkg001',
      version: '1.0.0',
    });
    await listHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  test('404 is never cached', async () => {
    const [req, res] = makeReqRes({
      package: 'com.example.nope',
      version: '9.9.9',
    });
    await listHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  test('400 on bad all_versions params is never cached', async () => {
    const [req, res] = makeReqRes({ all_versions: 'true' });
    await listHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_params');
    expect(res.headers['cache-control']).toBeUndefined();
  });

  test('non-GET is rejected and never cached', async () => {
    const [req, res] = makeReqRes();
    req.method = 'POST';
    await listHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['cache-control']).toBeUndefined();
  });
});
