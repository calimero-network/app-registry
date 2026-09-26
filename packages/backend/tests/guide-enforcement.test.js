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
