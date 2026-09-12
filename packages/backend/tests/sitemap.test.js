/**
 * GET /sitemap.xml
 *
 * The pages worth indexing on this site are the app pages, and there is no
 * build-time list of them — they are whatever has been published. So the
 * sitemap is a function, and what it must never do is disagree with browse:
 * a package appears here if and only if GET /api/v2/bundles would list it.
 *
 * Everything runs against the same in-memory Redis stand-in the other read
 * endpoint tests use, so it stays in the default `pnpm test` run.
 */

const store = new Map();
const sets = new Map();

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

const sitemapHandler = require('../../../api/sitemap');
const { buildSitemap, escapeXml, originFrom, toLastmod } = sitemapHandler;

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
    send(p) {
      this.body = p;
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
            metadata: { author: 'alice' },
            signature: { pubkey: 'pk-alice' },
            _publishedAt: meta.publishedAt,
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

describe('GET /sitemap.xml', () => {
  test('lists the public routes and every published package', async () => {
    seed({
      'com.calimero.mero-chat': {
        '1.0.0': { publishedAt: '2026-03-04T10:00:00.000Z' },
      },
      'com.example.sheets': {
        '2.1.0': { publishedAt: '2026-05-06T10:00:00.000Z' },
      },
    });

    const res = makeRes();
    await sitemapHandler(
      { method: 'GET', query: {}, headers: { host: 'apps.calimero.network' } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.body).toContain('<loc>https://apps.calimero.network/</loc>');
    expect(res.body).toContain(
      '<loc>https://apps.calimero.network/explore</loc>'
    );
    expect(res.body).toContain(
      '<loc>https://apps.calimero.network/apps/com.calimero.mero-chat</loc>'
    );
    expect(res.body).toContain(
      '<loc>https://apps.calimero.network/apps/com.example.sheets</loc>'
    );
    // ⚠️ A DATE, NOT A TIMESTAMP. `<lastmod>` takes W3C datetime; an
    // unparseable value invalidates the entry it sits in, so the publish time
    // is narrowed to the day rather than passed through.
    expect(res.body).toContain('<lastmod>2026-03-04</lastmod>');
  });

  test('names one URL per package, not one per version', async () => {
    // `/apps/:appId` is the page; the versions are a picker on it. A url per
    // version would be four duplicates of one page in the index.
    seed({
      'com.example.many': {
        '1.0.0': { publishedAt: '2026-01-01T00:00:00.000Z' },
        '1.1.0': { publishedAt: '2026-02-01T00:00:00.000Z' },
        '2.0.0': { publishedAt: '2026-03-01T00:00:00.000Z' },
      },
    });

    const res = makeRes();
    await sitemapHandler({ method: 'GET', query: {}, headers: {} }, res);

    const occurrences = res.body.match(/\/apps\/com\.example\.many</g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  test('answers with the static routes when the store is unreachable', async () => {
    // ⚠️ A SITEMAP THAT 500s IS WORSE THAN A SHORT ONE: Search Console reads
    // an error as "could not fetch" and drops the document entirely.
    const boom = new Error('redis down');
    const spy = jest
      .spyOn(mockKv, 'sMembers')
      .mockRejectedValueOnce(boom)
      .mockRejectedValue(boom);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = makeRes();
    await sitemapHandler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('/explore</loc>');
    expect(res.body).not.toContain('/apps/');

    spy.mockRestore();
    quiet.mockRestore();
  });

  test('refuses anything but a read', async () => {
    const res = makeRes();
    await sitemapHandler({ method: 'POST', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('the sitemap document', () => {
  test('takes its origin from the request, so a self-hosted registry maps itself', () => {
    expect(
      originFrom({
        headers: { host: 'registry.internal', 'x-forwarded-proto': 'http' },
      })
    ).toBe('http://registry.internal');
    expect(
      originFrom({ headers: { 'x-forwarded-host': 'apps.example.com' } })
    ).toBe('https://apps.example.com');
    // A request with no host at all still has to produce a valid document.
    expect(originFrom({ headers: {} })).toBe('https://apps.calimero.network');
  });

  test('escapes what goes into a <loc>', () => {
    expect(escapeXml('a&b<c>"d"')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
  });

  test('drops a lastmod it cannot parse rather than emitting one', () => {
    expect(toLastmod('not a date')).toBeNull();
    expect(toLastmod(null)).toBeNull();
    expect(toLastmod('2026-03-04T10:00:00.000Z')).toBe('2026-03-04');
  });

  test('is well-formed with no packages at all', () => {
    const xml = buildSitemap('https://apps.calimero.network', []);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    // Every <url> is closed, and there are as many as there are static routes.
    expect((xml.match(/<url>/g) ?? []).length).toBe(
      (xml.match(/<\/url>/g) ?? []).length
    );
  });
});
