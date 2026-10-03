const store = new Map();
const sets = new Map();
const calls = [];

const mockKv = {
  get: async key => {
    calls.push(['get', key]);
    return store.has(key) ? store.get(key) : null;
  },
  mGet: async keys => {
    calls.push(['mGet', keys]);
    return keys.map(key => (store.has(key) ? store.get(key) : null));
  },
  sMembers: async key => {
    calls.push(['sMembers', key]);
    return sets.has(key) ? [...sets.get(key)] : [];
  },
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

let mockUser = null;
jest.mock('../../../api/lib/auth-helpers', () => ({
  resolveUser: async () => mockUser,
}));

const listHandler = require('../../../api/v2/bundles/index');
const statsHandler = require('../../../api/stats');

function manifest(pkg, version) {
  return JSON.stringify({
    json: {
      package: pkg,
      appVersion: version,
      metadata: { author: `author-${pkg}` },
      signature: { pubkey: `pubkey-${pkg}` },
    },
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

function seed(packageCount, versionCount) {
  store.clear();
  sets.clear();
  const packages = Array.from(
    { length: packageCount },
    (_, i) => `com.example.pkg${String(i).padStart(3, '0')}`
  );
  const versions = Array.from({ length: versionCount }, (_, i) => `1.${i}.0`);
  sets.set('bundles:all', new Set(packages));
  for (const pkg of packages) {
    sets.set(`bundle-versions:${pkg}`, new Set(versions));
    for (const v of versions) store.set(`bundle:${pkg}/${v}`, manifest(pkg, v));
  }
  return { packages, versions };
}

function makeReqRes(query = {}, headers = {}) {
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
  return [{ method: 'GET', query, headers }, res];
}

async function list(query = {}) {
  const [req, res] = makeReqRes(query);
  calls.length = 0;
  await listHandler(req, res);
  return res;
}

const commandsFor = name => calls.filter(([cmd]) => cmd === name);

describe('GET /api/v2/bundles storage reads', () => {
  beforeEach(() => {
    mockUser = null;
  });

  test('reads no yank flag one key at a time', async () => {
    seed(20, 15);
    const res = await list();

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(20);
    const singleYankReads = commandsFor('get').filter(([, key]) =>
      key.startsWith('bundle-yanked:')
    );
    expect(singleYankReads).toHaveLength(0);
  });

  test('the number of commands does not grow with versions per package', async () => {
    seed(20, 2);
    await list();
    const few = calls.length;

    seed(20, 40);
    await list();
    const many = calls.length;

    expect(many).toBe(few);
  });

  test('the yank flags and manifests arrive in a constant number of batched reads', async () => {
    seed(30, 25);
    await list();

    expect(commandsFor('mGet')).toHaveLength(2);
    expect(commandsFor('mGet')[0][1]).toHaveLength(30 * 25);
    expect(calls.length).toBeLessThan(30 * 25);
  });

  test('the commands grow with packages, not with stored versions', async () => {
    seed(10, 25);
    await list();
    const ten = calls.length;

    seed(20, 25);
    await list();
    const twenty = calls.length;

    expect(twenty - ten).toBeLessThan(10 * 25);
    expect(twenty).toBeLessThanOrEqual(2 * ten);
  });

  test('yanked latest still falls back to the newest unyanked version', async () => {
    seed(3, 4);
    store.set('bundle-yanked:com.example.pkg001/1.3.0', '1');
    store.set('bundle-yanked:com.example.pkg001/1.2.0', '1');
    for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
      store.set(`bundle-yanked:com.example.pkg002/${v}`, '1');
    }
    const res = await list();

    expect(res.body.map(b => [b.package, b.appVersion, b.yanked])).toEqual([
      ['com.example.pkg000', '1.3.0', false],
      ['com.example.pkg001', '1.1.0', false],
    ]);
  });

  test('a fully yanked package stays in its author listing, flagged', async () => {
    seed(2, 2);
    store.set('bundle-yanked:com.example.pkg001/1.0.0', '1');
    store.set('bundle-yanked:com.example.pkg001/1.1.0', '1');
    const res = await list({ author: 'author-com.example.pkg001' });

    expect(res.body.map(b => [b.package, b.appVersion, b.yanked])).toEqual([
      ['com.example.pkg001', '1.1.0', true],
    ]);
  });

  test('all_versions keeps every yank flag', async () => {
    seed(1, 3);
    store.set('bundle-yanked:com.example.pkg000/1.1.0', '1');
    const res = await list({
      package: 'com.example.pkg000',
      all_versions: 'true',
    });

    expect(res.body.map(b => [b.appVersion, b.yanked])).toEqual([
      ['1.2.0', false],
      ['1.1.0', true],
      ['1.0.0', false],
    ]);
  });
});

describe('GET /api/v2/bundles fresh reads', () => {
  beforeEach(() => {
    mockUser = null;
    seed(5, 2);
  });

  test('an anonymous fresh read of the whole registry is served cacheable', async () => {
    const res = await list({ fresh: '1' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('s-maxage=30');
  });

  test('an anonymous fresh read filtered by author is served cacheable', async () => {
    const res = await list({ fresh: '1', author: 'author-com.example.pkg001' });

    expect(res.headers['cache-control']).toContain('s-maxage=30');
  });

  test('an anonymous fresh read of one package is honoured', async () => {
    const res = await list({ fresh: '1', package: 'com.example.pkg001' });

    expect(res.body.map(b => b.package)).toEqual(['com.example.pkg001']);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('a signed-in fresh read of the whole registry is honoured', async () => {
    mockUser = { email: 'owner@example.com' };
    const res = await list({ fresh: '1' });

    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('unknown query parameters get the normal cacheable answer', async () => {
    const res = await list({ cb: String(Date.now()) });

    expect(res.body).toHaveLength(5);
    expect(res.headers['cache-control']).toContain('s-maxage=30');
  });
});

describe('GET /api/stats', () => {
  test('is cacheable at the edge', async () => {
    seed(4, 3);
    const [req, res] = makeReqRes();
    await statsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.publishedBundles).toBe(12);
    expect(res.body.uniquePackages).toBe(4);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
    );
  });

  test('reads manifests in batches rather than one per version', async () => {
    seed(10, 30);
    const [req, res] = makeReqRes();
    calls.length = 0;
    await statsHandler(req, res);

    expect(res.body.publishedBundles).toBe(300);
    expect(commandsFor('get')).toHaveLength(0);
    expect(commandsFor('mGet').length).toBeLessThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(1 + 10 + 2);
  });

  test('a storage failure is not cached', async () => {
    const original = mockKv.sMembers;
    mockKv.sMembers = async () => {
      throw new Error('down');
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const [req, res] = makeReqRes();
      await statsHandler(req, res);
      expect(res.body.publishedBundles).toBe(0);
      expect(res.headers['cache-control']).toBeUndefined();
    } finally {
      mockKv.sMembers = original;
      errorSpy.mockRestore();
    }
  });
});
