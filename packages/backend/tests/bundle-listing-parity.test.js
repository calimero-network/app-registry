/**
 * Bundle Listing Endpoint Parity Tests
 *
 * GET /api/v2/bundles exists twice: as the deployed Vercel function
 * (api/v2/bundles/index.js) and on the Fastify server
 * (packages/backend/src/server.js) for Docker/self-hosted. This file drives
 * BOTH real endpoints with the same queries and records exactly where they
 * agree and where they do not.
 *
 * ── Why they were aligned toward Vercel ─────────────────────────────────────
 * The two used to disagree on `?package=X` with no `all_versions`: Vercel
 * returned the latest version only, Fastify returned every version and never
 * populated `yanked` (it did not read `all_versions` at all). That pre-dated
 * the batching work — on the previous commit the Vercel handler branched on
 * `all_versions === 'true' && pkg` while Fastify used
 * `const versionList = pkg ? versions : [versions[0]]`.
 *
 * Fastify was moved onto Vercel's semantics, not the other way round, because
 * Vercel's are the ones live clients are written against and the divergence
 * was actively breaking the desktop app against self-hosted registries. Its
 * registry client (apps/desktop/src/utils/registry.ts in the tauri-app repo)
 * takes an arbitrary registry URL and:
 *
 *   - `fetchAppsFromRegistry` maps ONE bundle to ONE app card carrying
 *     `latest_version`. Against Fastify, a name-filtered browse returned every
 *     version, so the marketplace rendered a duplicate card per version.
 *   - `fetchAppVersions` requests `all_versions=true` and drops entries where
 *     `bundle.yanked === true`. Fastify never set the field, so that check
 *     matched nothing and yanked releases were offered for install.
 *
 * Production behaviour is therefore unchanged (verified byte-identical against
 * apps.calimero.network), and self-hosted now matches it.
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

const vercelHandler = require('../../../api/v2/bundles/index');
const { buildServer } = require('../src/server');

const PKG = 'com.example.app';
const VERSIONS = ['1.0.0', '1.2.0', '1.10.0'];

function seed() {
  store.clear();
  sets.clear();
  sets.set('bundles:all', new Set([PKG, 'com.example.other']));
  sets.set(`bundle-versions:${PKG}`, new Set(VERSIONS));
  sets.set('bundle-versions:com.example.other', new Set(['1.0.0']));

  for (const version of VERSIONS) {
    store.set(
      `bundle:${PKG}/${version}`,
      JSON.stringify({
        json: {
          package: PKG,
          appVersion: version,
          metadata: { author: 'alice' },
          signature: { pubkey: 'pk-alice' },
        },
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );
  }
  store.set(
    'bundle:com.example.other/1.0.0',
    JSON.stringify({
      json: {
        package: 'com.example.other',
        appVersion: '1.0.0',
        metadata: { author: 'bob' },
        signature: { pubkey: 'pk-bob' },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
}

/** Invoke the Vercel function with a plain query object. */
async function callVercel(query) {
  const res = {
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
  await vercelHandler({ method: 'GET', query, headers: {} }, res);
  return res;
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => seed());

/** Invoke the real Fastify route. */
async function callFastify(qs) {
  const response = await server.inject({
    method: 'GET',
    url: `/api/v2/bundles${qs}`,
  });
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.payload),
  };
}

describe('where the two endpoints agree', () => {
  test('the default browse listing returns the latest version per package', async () => {
    const vercel = await callVercel({});
    const fastify = await callFastify('');

    const shape = r => r.body.map(b => `${b.package}@${b.appVersion}`).sort();

    // 1.10.0 > 1.2.0 — both must sort with semver, not lexically.
    expect(shape(vercel)).toEqual([
      'com.example.app@1.10.0',
      'com.example.other@1.0.0',
    ]);
    expect(shape(fastify)).toEqual(shape(vercel));
  });

  test('neither exposes internal metadata in the browse listing', async () => {
    const vercel = await callVercel({});
    const fastify = await callFastify('');

    for (const result of [vercel, fastify]) {
      for (const bundle of result.body) {
        expect(bundle.metadata._ownerEmail).toBeUndefined();
        expect(bundle.metadata._adminVerified).toBeUndefined();
      }
    }
  });

  test('an unmatched developer filter yields an empty listing on both', async () => {
    const vercel = await callVercel({ developer: 'pk-nobody' });
    const fastify = await callFastify('?developer=pk-nobody');

    expect(vercel.body).toEqual([]);
    expect(fastify.body).toEqual([]);
  });
});

describe('?package=X without all_versions returns the latest version only', () => {
  test('on both endpoints', async () => {
    const vercel = await callVercel({ package: PKG });
    const fastify = await callFastify(`?package=${PKG}`);

    expect(vercel.body.map(b => b.appVersion)).toEqual(['1.10.0']);
    expect(fastify.body.map(b => b.appVersion)).toEqual(['1.10.0']);
  });
});

describe('all_versions and yank status', () => {
  test('both return every version, newest first, with yank flags', async () => {
    store.set(`bundle-yanked:${PKG}/1.2.0`, '1');

    const vercel = await callVercel({ package: PKG, all_versions: 'true' });
    const fastify = await callFastify(`?package=${PKG}&all_versions=true`);

    for (const res of [vercel, fastify]) {
      expect(res.body.map(b => b.appVersion)).toEqual([
        '1.10.0',
        '1.2.0',
        '1.0.0',
      ]);
      expect(res.body.map(b => b.yanked)).toEqual([false, true, false]);
    }
  });

  test('both reject all_versions without a package', async () => {
    const vercel = await callVercel({ all_versions: 'true' });
    const fastify = await callFastify('?all_versions=true');

    expect(vercel.statusCode).toBe(400);
    expect(fastify.statusCode).toBe(400);
    expect(vercel.body.error).toBe('invalid_params');
    expect(fastify.body.error).toBe('invalid_params');
  });

  test('both reject all_versions combined with developer or author', async () => {
    const vercel = await callVercel({
      package: PKG,
      all_versions: 'true',
      developer: 'pk-alice',
    });
    const fastify = await callFastify(
      `?package=${PKG}&all_versions=true&developer=pk-alice`
    );

    expect(vercel.statusCode).toBe(400);
    expect(fastify.statusCode).toBe(400);
  });
});

describe('contract the desktop app depends on', () => {
  // tauri-app apps/desktop/src/utils/registry.ts talks to an arbitrary registry
  // URL, so these must hold on BOTH deployments or the marketplace misbehaves.

  test('a name-filtered browse yields exactly one card per package', async () => {
    // fetchAppsFromRegistry maps one bundle to one app card carrying
    // latest_version. More than one entry per package renders duplicates.
    const vercel = await callVercel({ package: PKG });
    const fastify = await callFastify(`?package=${PKG}`);

    expect(vercel.body).toHaveLength(1);
    expect(fastify.body).toHaveLength(1);
  });

  test('the version list carries yanked so the app can filter it', async () => {
    // fetchAppVersions drops entries where `bundle.yanked === true` — strict
    // equality, so a missing field silently offers yanked releases to install.
    store.set(`bundle-yanked:${PKG}/1.2.0`, '1');

    const vercel = await callVercel({ package: PKG, all_versions: 'true' });
    const fastify = await callFastify(`?package=${PKG}&all_versions=true`);

    for (const res of [vercel, fastify]) {
      const installable = res.body.filter(b => b.yanked !== true);
      expect(installable.map(b => b.appVersion)).toEqual(['1.10.0', '1.0.0']);
    }
  });
});

describe('KNOWN GAP: yank status is absent from the browse listing', () => {
  test('a yanked latest version is not flagged in the default listing', async () => {
    // Pre-existing on both sides: the per-package-latest listing never resolves
    // bundle-yanked:*, so a security-yanked latest release is presented exactly
    // like a healthy one. Cheap to fix — the lookup rides the same pipelined
    // round trip — but it changes the response shape of the most-consumed
    // endpoint, so it needs to be a deliberate API decision.
    store.set(`bundle-yanked:${PKG}/1.10.0`, '1');

    const vercel = await callVercel({});
    const fastify = await callFastify('');

    const entry = r => r.body.find(b => b.package === PKG);
    expect('yanked' in entry(vercel)).toBe(false);
    expect('yanked' in entry(fastify)).toBe(false);
  });
});
