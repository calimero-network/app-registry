/**
 * Units behind Cloud private packages: namespace boundaries, the Cloud
 * manager authorize client (HMAC, caching, failure modes), the audit list
 * paging and the package-record migration.
 */

const crypto = require('crypto');
const { createMemoryKv } = require('./helpers/memory-kv');

const mockKv = createMemoryKv();
jest.mock('../../../api/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

const {
  namespaceOf,
} = require('@calimero-network/registry-shared/package-namespace');
const {
  authorizeDownload,
  notifyPublished,
  publishedUrl,
  parseBasicAuth,
  signRequest,
  AuthorizeUnavailableError,
  POSITIVE_TTL_MS,
  NEGATIVE_TTL_MS,
  _clearAuthorizeCache,
} = require('../../../api/lib/cloud-authorize');
const { appendAudit, listAudit } = require('../../../api/lib/org-audit');
const {
  migratePackageRecords,
  parseArgs,
} = require('../../../scripts/migrate-package-records');

describe('namespaceOf', () => {
  test.each([
    ['com.acme.app', 'com.acme'],
    ['com.acme.app.sub', 'com.acme'],
    ['com.acme', 'com.acme'],
    ['acme.app', 'acme'],
    ['acme.tools.app', 'acme'],
    ['io.github.alice.app', 'io.github.alice'],
    ['de.example.app', 'de.example'],
    ['network.calimero.app', 'network.calimero'],
  ])('%s -> %s', (pkg, ns) => {
    expect(namespaceOf(pkg)).toBe(ns);
  });
});

describe('parseBasicAuth', () => {
  const b64 = s => Buffer.from(s).toString('base64');
  test('reads user and password', () => {
    expect(parseBasicAuth(`Basic ${b64('cluster-a:tok:with:colons')}`)).toEqual(
      { user: 'cluster-a', pass: 'tok:with:colons' }
    );
  });
  test('decodes percent-encoded userinfo a client left encoded', () => {
    expect(parseBasicAuth(`Basic ${b64('c%40x:p%2Fq')}`)).toEqual({
      user: 'c@x',
      pass: 'p/q',
    });
  });
  test.each([
    undefined,
    'Bearer abc',
    `Basic ${b64('nopassword')}`,
    `Basic ${b64(':pass')}`,
    `Basic ${b64('user:')}`,
  ])('rejects %p', header => {
    expect(parseBasicAuth(header)).toBeNull();
  });
});

describe('authorizeDownload', () => {
  const SECRET = 'shh';
  let now;
  beforeEach(() => {
    _clearAuthorizeCache();
    now = 1_800_000_000_000;
    process.env.CLOUD_AUTHORIZE_URL =
      'https://mdma.test/internal/registry/authorize';
    process.env.CLOUD_AUTHORIZE_HMAC_SECRET = SECRET;
  });
  afterAll(() => {
    delete process.env.CLOUD_AUTHORIZE_URL;
    delete process.env.CLOUD_AUTHORIZE_HMAC_SECRET;
  });

  const args = {
    clusterUser: 'cluster-a',
    token: 'tok-a',
    pkg: 'com.acme.app',
    version: '1.0.0',
  };
  const answering = (status, body) =>
    jest.fn(async () => ({ status, json: async () => body }));

  test('signs the exact body with the shared secret', async () => {
    const fetchImpl = answering(200, { allowed: true, org_id: 'org_acme' });
    const out = await authorizeDownload(args, { fetchImpl, now: () => now });
    expect(out).toEqual({ allowed: true, orgId: 'org_acme', cached: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(process.env.CLOUD_AUTHORIZE_URL);
    expect(JSON.parse(init.body)).toEqual({
      cluster_user: 'cluster-a',
      token: 'tok-a',
      package: 'com.acme.app',
      version: '1.0.0',
    });
    expect(JSON.parse(init.body).org).toBeUndefined();
    const ts = init.headers['X-Registry-Timestamp'];
    expect(ts).toBe(String(now / 1000));
    // mdma's scheme: sha256=<hex HMAC(secret, "{ts}.{body}")>.
    const mac = crypto
      .createHmac('sha256', SECRET)
      .update(`${ts}.${init.body}`)
      .digest('hex');
    expect(init.headers['X-Registry-Signature']).toBe(`sha256=${mac}`);
    expect(signRequest(SECRET, ts, init.body)).toBe(`sha256=${mac}`);
    expect(init.redirect).toBe('error');
  });

  test('caches an allow for 60 s and a deny for 10 s', async () => {
    const allow = answering(200, { allowed: true, org_id: 'o' });
    await authorizeDownload(args, { fetchImpl: allow, now: () => now });
    now += POSITIVE_TTL_MS - 1;
    expect(
      (await authorizeDownload(args, { fetchImpl: allow, now: () => now }))
        .cached
    ).toBe(true);
    now += 2;
    await authorizeDownload(args, { fetchImpl: allow, now: () => now });
    expect(allow).toHaveBeenCalledTimes(2);

    _clearAuthorizeCache();
    const deny = answering(200, { allowed: false, org_id: null });
    await authorizeDownload(args, { fetchImpl: deny, now: () => now });
    now += NEGATIVE_TTL_MS - 1;
    await authorizeDownload(args, { fetchImpl: deny, now: () => now });
    now += 2;
    await authorizeDownload(args, { fetchImpl: deny, now: () => now });
    expect(deny).toHaveBeenCalledTimes(2);
  });

  test('sends the owning org when known', async () => {
    const fetchImpl = answering(200, { allowed: true, org_id: 'org_acme' });
    await authorizeDownload({ ...args, org: 'org_acme' }, { fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).org).toBe('org_acme');
  });

  test('publishedUrl derives from the authorize URL', () => {
    expect(publishedUrl()).toBe(
      'https://mdma.test/internal/registry/published'
    );
    process.env.CLOUD_PUBLISHED_URL = 'https://hooks.test/p';
    expect(publishedUrl()).toBe('https://hooks.test/p');
    delete process.env.CLOUD_PUBLISHED_URL;
  });

  test('a failing publish webhook never throws', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('down');
    });
    await expect(
      notifyPublished(
        { package: 'p', version: '1.0.0', org: 'o' },
        { fetchImpl }
      )
    ).resolves.toBe(false);
    expect(
      await notifyPublished(
        { package: 'p', version: '1.0.0', org: 'o' },
        { fetchImpl: answering(204, {}) }
      )
    ).toBe(true);
  });

  test('a different token is a different cache entry', async () => {
    const allow = answering(200, { allowed: true, org_id: 'o' });
    await authorizeDownload(args, { fetchImpl: allow, now: () => now });
    const deny = answering(200, { allowed: false });
    const out = await authorizeDownload(
      { ...args, token: 'other' },
      { fetchImpl: deny, now: () => now }
    );
    expect(out.allowed).toBe(false);
  });

  test.each([
    ['a 500', answering(500, {})],
    ['a malformed answer', answering(200, { ok: true })],
    [
      'a network error',
      jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    ],
  ])('throws (fail closed, uncached) on %s', async (_l, fetchImpl) => {
    await expect(
      authorizeDownload(args, { fetchImpl, now: () => now })
    ).rejects.toBeInstanceOf(AuthorizeUnavailableError);
    const allow = answering(200, { allowed: true, org_id: 'o' });
    expect(
      (await authorizeDownload(args, { fetchImpl: allow, now: () => now }))
        .allowed
    ).toBe(true);
  });

  test('times out', async () => {
    process.env.CLOUD_AUTHORIZE_TIMEOUT_MS = '20';
    const hang = jest.fn(
      (_u, { signal }) =>
        new Promise((_r, reject) =>
          signal.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          })
        )
    );
    await expect(authorizeDownload(args, { fetchImpl: hang })).rejects.toThrow(
      /timeout/
    );
    delete process.env.CLOUD_AUTHORIZE_TIMEOUT_MS;
  });

  test('unconfigured is unavailable, never allowed', async () => {
    delete process.env.CLOUD_AUTHORIZE_HMAC_SECRET;
    await expect(authorizeDownload(args)).rejects.toBeInstanceOf(
      AuthorizeUnavailableError
    );
  });
});

describe('org audit list', () => {
  beforeEach(() => mockKv.clear());
  test('pages newest first and ignores unknown types and orgless events', async () => {
    for (let i = 0; i < 5; i++) {
      await appendAudit('o1', {
        type: 'publish',
        package: 'p',
        version: `1.0.${i}`,
      });
    }
    expect(await appendAudit('o1', { type: 'nope', package: 'p' })).toBeNull();
    expect(
      await appendAudit(null, { type: 'publish', package: 'p' })
    ).toBeNull();
    const first = await listAudit('o1', { limit: 2 });
    expect(first.total).toBe(5);
    expect(first.events.map(e => e.version)).toEqual(['1.0.4', '1.0.3']);
    const next = await listAudit('o1', { limit: 2, offset: 2 });
    expect(next.events.map(e => e.version)).toEqual(['1.0.2', '1.0.1']);
    expect((await listAudit('o1', { offset: 10 })).events).toEqual([]);
  });
});

describe('migrate-package-records', () => {
  function seed(kv) {
    const bundle = (pkg, v, extra = {}) =>
      kv.set(
        `bundle:${pkg}/${v}`,
        JSON.stringify({
          json: {
            package: pkg,
            appVersion: v,
            signature: { publicKey: `key-${pkg}` },
            metadata: { _ownerEmail: 'Owner@Acme.io' },
            _publishedAt: `2025-01-0${v[0]}T00:00:00.000Z`,
            ...extra,
          },
        })
      );
    return Promise.all([
      kv.sAdd(
        'bundles:all',
        'com.acme.a',
        'com.acme.b',
        'com.mixed.a',
        'com.mixed.b',
        'com.calimero.x'
      ),
      kv.sAdd('bundle-versions:com.acme.a', '1.0.0', '2.0.0'),
      bundle('com.acme.a', '1.0.0'),
      bundle('com.acme.a', '2.0.0'),
      kv.sAdd('bundle-versions:com.acme.b', '1.0.0'),
      bundle('com.acme.b', '1.0.0'),
      kv.set('pkg2org:com.acme.a', 'acme'),
      kv.set('pkg2org:com.acme.b', 'acme'),
      kv.set('pkg2org:com.mixed.a', 'acme'),
      kv.set('pkg2org:com.calimero.x', 'calimero'),
      kv.set('org:acme', JSON.stringify({ id: 'acme', slug: 'acme' })),
    ]);
  }

  test('dry run writes nothing', async () => {
    const kv = createMemoryKv();
    await seed(kv);
    const before = JSON.stringify([...kv.store]);
    const summary = await migratePackageRecords(kv, {
      links: [['acme', 'org_acme']],
      claimNamespaces: true,
    });
    expect(summary).toMatchObject({ created: 5, linked: 1, claimed: 1 });
    expect(JSON.stringify([...kv.store])).toBe(before);
  });

  test('apply: public records, org links, safe namespace claims; idempotent', async () => {
    const kv = createMemoryKv();
    await seed(kv);
    const opts = {
      apply: true,
      links: [['acme', 'org_acme']],
      claimNamespaces: true,
    };
    const summary = await migratePackageRecords(kv, opts);
    expect(summary).toMatchObject({
      created: 5,
      linked: 1,
      claimed: 1,
      errors: 0,
    });
    expect(JSON.parse(kv.store.get('pkg:com.acme.a'))).toMatchObject({
      org_id: 'acme',
      visibility: 'public',
      signer_id: 'key-com.acme.a',
      owner_email: 'owner@acme.io',
      created_at: '2025-01-01T00:00:00.000Z',
    });
    expect(kv.store.get('ns:com.acme')).toBe('acme');
    // Mixed ownership and reserved prefixes are never claimed.
    expect(kv.store.has('ns:com.mixed')).toBe(false);
    expect(kv.store.has('ns:com.calimero')).toBe(false);
    expect(kv.store.get('org:by_cloud:org_acme')).toBe('acme');
    expect(JSON.parse(kv.store.get('org:acme')).cloud_org_id).toBe('org_acme');

    const again = await migratePackageRecords(kv, opts);
    expect(again).toMatchObject({ created: 0, existing: 5, claimed: 0 });
  });

  test('refuses to re-point a Cloud link', async () => {
    const kv = createMemoryKv();
    await seed(kv);
    await kv.set('org:by_cloud:org_acme', 'someone-else');
    const summary = await migratePackageRecords(kv, {
      apply: true,
      links: [['acme', 'org_acme']],
    });
    expect(summary.errors).toBe(1);
    expect(kv.store.get('org:by_cloud:org_acme')).toBe('someone-else');
  });

  test('parseArgs', () => {
    expect(
      parseArgs([
        '--apply',
        '--link-cloud-org',
        'acme=org_1',
        '--claim-namespaces',
      ])
    ).toEqual({
      apply: true,
      claimNamespaces: true,
      links: [['acme', 'org_1']],
    });
    expect(() => parseArgs(['--link-cloud-org', 'bad'])).toThrow();
  });
});
