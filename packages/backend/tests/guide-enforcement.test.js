/**
 * Every route that writes a version enforces the guide format, while versions
 * stored before the rule keep listing, downloading and accepting edits.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const tar = require('tar');

const store = new Map();
const sets = new Map();

const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async () => 1,
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sMembers: async k => [...setFor(k)],
  sIsMember: async (k, m) => setFor(k).has(m),
  sRem: async () => 0,
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
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async () => {}),
  getBinary: jest.fn(async () => null),
}));
// Signatures and ownership are not what this file is about.
jest.mock('../src/lib/verify', () => ({
  ...jest.requireActual('../src/lib/verify'),
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  isAllowedOwner: jest.fn().mockReturnValue(true),
}));
jest.mock('../../../api/lib/verify', () => ({
  ...jest.requireActual('../../../api/lib/verify'),
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  isAllowedOwner: jest.fn().mockReturnValue(true),
}));

const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const listHandler = require('../../../api/v2/bundles/index');
const versionHandler = require('../../../api/v2/bundles/[package]/[version]');
const artifactHandler = require('../../../api/artifacts/[package]/[version]/[filename]');
const { buildServer } = require('../src/server');
const { TEST_ICON, VALID_GUIDE } = require('./helpers/publishable');

const BOUNDARY = 'guide-enforcement-boundary';
const MISSING_GUIDE = {
  error: 'invalid_guide',
  message:
    "This bundle's guide does not follow the registry's guide format:\n  - metadata.guide: required",
  problems: ['metadata.guide: required'],
};

function manifest(metadata) {
  return {
    version: '1.0',
    package: 'com.example.guided',
    appVersion: '1.0.0',
    metadata: {
      name: 'Guided',
      description: 'A bundle used to exercise guide enforcement.',
      category: 'developer-tools',
      icon: TEST_ICON,
      ...metadata,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
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
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

async function mpkOf(bundleManifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-enforcement-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify(bundleManifest)
    );
    const file = path.join(dir, 'bundle.mpk');
    await tar.c({ gzip: true, file, cwd: dir }, ['manifest.json']);
    return fs.readFileSync(file);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

async function multipartOf(bundleManifest) {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="bundle"; filename="app.mpk"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    await mpkOf(bundleManifest),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  store.clear();
  sets.clear();
});

async function callVercel(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return { statusCode: res.statusCode, body: res.body };
}

async function callFastify(options) {
  const response = await server.inject(options);
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.payload),
  };
}

const pushRoutes = {
  'Vercel POST /push': m =>
    callVercel(pushHandler, { method: 'POST', headers: {}, body: m }),
  'Vercel POST /push-file': async m => {
    const req = Readable.from([await multipartOf(m)]);
    req.method = 'POST';
    req.headers = {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    };
    return callVercel(pushFileHandler, req);
  },
  'Fastify POST /push': m =>
    callFastify({ method: 'POST', url: '/api/v2/bundles/push', payload: m }),
  'Fastify POST /push-file': async m =>
    callFastify({
      method: 'POST',
      url: '/api/v2/bundles/push-file',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: await multipartOf(m),
    }),
};

describe.each(Object.entries(pushRoutes))('%s', (_route, push) => {
  test('rejects a version without a guide with 422 and its problems', async () => {
    expect(await push(manifest({}))).toEqual({
      statusCode: 422,
      body: MISSING_GUIDE,
    });
  });

  test('lists every guide problem', async () => {
    const guide = VALID_GUIDE.replace('## Overview\n', '').replace(
      '### Increment the counter\n',
      ''
    );
    const { statusCode, body } = await push(manifest({ guide }));
    expect(statusCode).toBe(422);
    expect(body.problems).toEqual([
      "metadata.guide: missing section '## Overview'",
      "metadata.guide: '## Procedures' has no '###' procedure",
    ]);
    expect(body.error).toBe('invalid_guide');
  });

  test('publishes a version with a valid guide', async () => {
    const { statusCode } = await push(manifest({ guide: VALID_GUIDE }));
    expect(statusCode).toBe(201);
  });
});

describe('versions stored before the guide rule', () => {
  const LEGACY = 'com.example.legacy';
  const legacyManifest = () => ({
    ...manifest({ name: 'Legacy', author: 'alice' }),
    package: LEGACY,
  });

  beforeEach(() => {
    setFor('bundles:all').add(LEGACY);
    setFor(`bundle-versions:${LEGACY}`).add('1.0.0');
    store.set(
      `bundle:${LEGACY}/1.0.0`,
      JSON.stringify({
        json: legacyManifest(),
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );
    store.set(
      `binary:${LEGACY}/1.0.0`,
      Buffer.from('legacy-mpk').toString('hex')
    );
  });

  test('still appear in the listing', async () => {
    const { statusCode, body } = await callVercel(listHandler, {
      method: 'GET',
      query: {},
      headers: {},
    });
    expect(statusCode).toBe(200);
    expect(body.map(b => b.package)).toContain(LEGACY);
  });

  test('still download', async () => {
    const { statusCode, body } = await callVercel(artifactHandler, {
      method: 'GET',
      query: { package: LEGACY, version: '1.0.0', filename: 'legacy.mpk' },
      url: `/api/artifacts/${LEGACY}/1.0.0/legacy.mpk`,
      headers: {},
    });
    expect(statusCode).toBe(200);
    expect(body.toString()).toBe('legacy-mpk');
  });

  const patchRoutes = {
    'Vercel PATCH': m =>
      callVercel(versionHandler, {
        method: 'PATCH',
        query: { package: LEGACY, version: '1.0.0' },
        headers: {},
        body: m,
      }),
    'Fastify PATCH': m =>
      callFastify({
        method: 'PATCH',
        url: `/api/v2/bundles/${LEGACY}/1.0.0`,
        payload: m,
      }),
  };

  describe.each(Object.entries(patchRoutes))('%s', (_route, patch) => {
    test('edits metadata without adding a guide', async () => {
      const edit = legacyManifest();
      edit.metadata.name = 'Renamed';
      expect((await patch(edit)).statusCode).toBe(200);
    });

    test('keeps an unchanged stored guide even if it breaks the rule', async () => {
      const stored = legacyManifest();
      stored.metadata.guide = '## Overview only';
      store.set(
        `bundle:${LEGACY}/1.0.0`,
        JSON.stringify({ json: stored, created_at: '2026-01-01T00:00:00Z' })
      );
      const edit = legacyManifest();
      edit.metadata.guide = '## Overview only';
      edit.metadata.name = 'Renamed';
      expect((await patch(edit)).statusCode).toBe(200);
    });

    test('rejects a guide the edit introduces when it breaks the rule', async () => {
      const edit = legacyManifest();
      edit.metadata.guide = VALID_GUIDE.replace('## Overview\n', '');
      expect(await patch(edit)).toEqual({
        statusCode: 422,
        body: {
          error: 'invalid_guide',
          message:
            "This bundle's guide does not follow the registry's guide format:\n  - metadata.guide: missing section '## Overview'",
          problems: ["metadata.guide: missing section '## Overview'"],
        },
      });
    });

    test('accepts a valid guide the edit introduces', async () => {
      const edit = legacyManifest();
      edit.metadata.guide = VALID_GUIDE;
      expect((await patch(edit)).statusCode).toBe(200);
    });
  });

  const ownershipMockByRoute = {
    'Vercel PATCH': require('../../../api/lib/verify').isAllowedOwner,
    'Fastify PATCH': require('../src/lib/verify').isAllowedOwner,
  };

  describe.each(Object.entries(patchRoutes))(
    '%s: unauthorized caller carrying an invalid guide',
    (route, patch) => {
      test('gets the auth error, not 422', async () => {
        ownershipMockByRoute[route].mockReturnValueOnce(false);
        const edit = legacyManifest();
        edit.metadata.guide = VALID_GUIDE.replace('## Overview\n', '');
        const { statusCode, body } = await patch(edit);
        expect(statusCode).toBe(403);
        expect(body.error).toBe('not_owner');
      });
    }
  );
});

describe('a version stored with a valid guide', () => {
  const GUIDED = 'com.example.guided-stored';
  const storedManifest = () => ({
    ...manifest({ name: 'Guided', author: 'alice', guide: VALID_GUIDE }),
    package: GUIDED,
  });

  beforeEach(() => {
    setFor('bundles:all').add(GUIDED);
    setFor(`bundle-versions:${GUIDED}`).add('1.0.0');
    store.set(
      `bundle:${GUIDED}/1.0.0`,
      JSON.stringify({
        json: storedManifest(),
        created_at: '2026-01-01T00:00:00.000Z',
      })
    );
    store.set(
      `binary:${GUIDED}/1.0.0`,
      Buffer.from('guided-mpk').toString('hex')
    );
  });

  const patchRoutes = {
    'Vercel PATCH': m =>
      callVercel(versionHandler, {
        method: 'PATCH',
        query: { package: GUIDED, version: '1.0.0' },
        headers: {},
        body: m,
      }),
    'Fastify PATCH': m =>
      callFastify({
        method: 'PATCH',
        url: `/api/v2/bundles/${GUIDED}/1.0.0`,
        payload: m,
      }),
  };

  describe.each(Object.entries(patchRoutes))('%s', (_route, patch) => {
    test('rejects an edit whose metadata omits the stored guide', async () => {
      const edit = storedManifest();
      delete edit.metadata.guide;
      expect(await patch(edit)).toEqual({
        statusCode: 422,
        body: MISSING_GUIDE,
      });
      const stillStored = JSON.parse(store.get(`bundle:${GUIDED}/1.0.0`));
      expect(stillStored.json.metadata.guide).toBe(VALID_GUIDE);
    });
  });

  test('Fastify PATCH: a body with no metadata field at all keeps the stored guide', async () => {
    const edit = storedManifest();
    delete edit.metadata;
    const { statusCode } = await callFastify({
      method: 'PATCH',
      url: `/api/v2/bundles/${GUIDED}/1.0.0`,
      payload: edit,
    });
    expect(statusCode).toBe(200);
    const stillStored = JSON.parse(store.get(`bundle:${GUIDED}/1.0.0`));
    expect(stillStored.json.metadata.guide).toBe(VALID_GUIDE);
  });
});
