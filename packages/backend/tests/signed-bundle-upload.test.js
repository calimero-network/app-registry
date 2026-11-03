/**
 * Direct-to-storage bundle upload: /upload-url hands out a signed PUT URL for
 * a per-account staging object, and push accepts `_upload` instead of `_binary`.
 */

const crypto = require('crypto');

const mockKv = {
  get: jest.fn(),
  set: jest.fn(),
  setNX: jest.fn(),
  del: jest.fn(),
  sAdd: jest.fn(),
  sMembers: jest.fn(),
  sIsMember: jest.fn(),
};
jest.mock('../src/lib/kv-client', () => ({ kv: mockKv }));
// The bundle store reads through the stubbed client above; everything else
// (staging records, audit) gets a real in-memory store. api/lib/kv-client now
// re-exports the backend client, so it has to be pointed at the real one here
// or it would inherit the stub too.
jest.mock('../../../api/lib/kv-client', () =>
  jest.requireActual('../src/lib/kv-client')
);

jest.mock('../src/lib/bundle-integrity', () => ({
  ...jest.requireActual('../src/lib/bundle-integrity'),
  verifyBundleBinary: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

let mockCurrentUser = null;
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return { ...actual, resolveUser: async () => mockCurrentUser };
});

let mockTrusted = true;
jest.mock('../../../api/lib/admin-storage', () => ({
  isBot: jest.fn(async () => mockTrusted === 'bot'),
  isAdmin: jest.fn(async () => mockTrusted === 'admin'),
}));

// In-memory bucket: name -> { data, size }
const mockObjects = new Map();
const mockGetSignedUrl = jest.fn(async () => [
  'https://storage.example/signed',
]);
const mockFile = name => ({
  getSignedUrl: opts => mockGetSignedUrl(name, opts),
  getMetadata: async () => {
    const o = mockObjects.get(name);
    if (!o) throw Object.assign(new Error('nf'), { code: 404 });
    return [{ size: String(o.size) }];
  },
  download: async () => {
    const o = mockObjects.get(name);
    if (!o) throw Object.assign(new Error('nf'), { code: 404 });
    return [o.data];
  },
  delete: jest.fn(async () => {
    mockObjects.delete(name);
  }),
  save: async data => {
    mockObjects.set(name, { data, size: data.length });
  },
  metadata: {},
});
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn(() => ({ bucket: () => ({ file: mockFile }) })),
}));

const { MAX_BUNDLE_BYTES } = require('../src/lib/blob-store');
const uploadUrlHandler = require('../../../api/v2/bundles/upload-url');
const pushHandler = require('../../../api/v2/bundles/push');
const { kv: apiKv } = require('../../../api/lib/kv-client');
const { TEST_ICON } = require('./helpers/publishable');

const EMAIL = 'dev@example.com';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const mine = `uploads/${sha(EMAIL)}/${crypto.randomUUID()}.mpk`;

function makeManifest(overrides = {}) {
  return {
    version: '1.0',
    package: 'com.example.test',
    appVersion: '1.0.0',
    metadata: {
      name: 'Test App',
      description: 'A test app used to exercise the signed upload flow.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
    ...overrides,
  };
}

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  setHeader: jest.fn().mockReturnThis(),
});

async function push(body) {
  const res = makeRes();
  await pushHandler({ method: 'POST', headers: {}, body }, res);
  return res;
}

const refusedWith = (res, status, error) => {
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error }));
};

beforeEach(async () => {
  jest.clearAllMocks();
  await apiKv._clear();
  mockTrusted = 'bot';
  process.env.GCS_BUCKET = 'test-bucket';
  mockObjects.clear();
  mockCurrentUser = { email: EMAIL };
  mockKv.get.mockResolvedValue(null);
  mockKv.setNX.mockResolvedValue(true);
  mockKv.sAdd.mockResolvedValue(1);
  mockKv.sMembers.mockResolvedValue([]);
  mockKv.sIsMember.mockResolvedValue(false);
});

describe('POST /api/v2/bundles/upload-url', () => {
  const call = async () => {
    const res = makeRes();
    await uploadUrlHandler({ method: 'POST', headers: {} }, res);
    return res;
  };

  test('requires authentication', async () => {
    mockCurrentUser = null;
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test('refuses a signed-in account that is not bot, admin or staff', async () => {
    mockTrusted = false;
    const res = await call();
    refusedWith(res, 403, 'forbidden');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test.each([['bot'], ['admin']])('allows a %s account', async kind => {
    mockTrusted = kind;
    expect((await call()).status).toHaveBeenCalledWith(200);
  });

  test('allows a staff account', async () => {
    mockTrusted = false;
    mockCurrentUser = { email: 'someone@calimero.network' };
    expect((await call()).status).toHaveBeenCalledWith(200);
  });

  test('grants 100 per hour per account, then 429', async () => {
    for (let i = 0; i < 100; i++) {
      expect((await call()).status).toHaveBeenCalledWith(200);
    }
    const res = await call();
    refusedWith(res, 429, 'rate_limited');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '3600');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(100);
    mockCurrentUser = { email: 'other@example.com' };
    expect((await call()).status).toHaveBeenCalledWith(200);
  });

  test('rejects other methods', async () => {
    const res = makeRes();
    await uploadUrlHandler({ method: 'GET', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('signs a write URL for the caller staging object', async () => {
    const before = Date.now();
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    const range = `0,${MAX_BUNDLE_BYTES}`;
    expect(body.object).toMatch(
      new RegExp(`^uploads/${sha(EMAIL)}/[0-9a-f-]{36}\\.mpk$`)
    );
    expect(body).toMatchObject({
      url: 'https://storage.example/signed',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        'x-goog-content-length-range': range,
      },
    });
    const [object, opts] = mockGetSignedUrl.mock.calls[0];
    expect(object).toBe(body.object);
    expect(opts).toMatchObject({
      version: 'v4',
      action: 'write',
      contentType: 'application/gzip',
      extensionHeaders: { 'x-goog-content-length-range': range },
    });
    const fifteenMin = 15 * 60 * 1000;
    expect(opts.expires).toBeGreaterThanOrEqual(before + fifteenMin);
    expect(opts.expires).toBeLessThanOrEqual(Date.now() + fifteenMin);
    expect(new Date(body.expiresAt).getTime()).toBe(opts.expires);
  });
});

describe('push with _upload', () => {
  test('publishes the staged bundle and deletes the staging object', async () => {
    mockObjects.set(mine, { data: Buffer.from('mpk-bytes'), size: 9 });
    const res = await push(makeManifest({ _upload: { object: mine } }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ installSize: 9 })
    );
    expect(mockObjects.has(mine)).toBe(false);
    expect([...mockObjects.keys()]).toEqual([
      'bundles/com.example.test/1.0.0.mpk',
    ]);
  });

  test('another account staging object is refused', async () => {
    const theirs = `uploads/${sha('other@example.com')}/${crypto.randomUUID()}.mpk`;
    mockObjects.set(theirs, { data: Buffer.from('x'), size: 1 });
    refusedWith(
      await push(makeManifest({ _upload: { object: theirs } })),
      400,
      'invalid_upload'
    );
    expect(mockObjects.has(theirs)).toBe(true);
  });

  const uuid = crypto.randomUUID();
  const h = sha(EMAIL);
  test.each([
    ['dot-dot segment', `uploads/${h}/../bundles/x.mpk`],
    ['other prefix', `bundles/${h}/${uuid}.mpk`],
    ['leading slash', `/uploads/${h}/${uuid}.mpk`],
    ['non-uuid name', `uploads/${h}/not-a-uuid.mpk`],
    ['uuid v1', `uploads/${h}/6ba7b810-9dad-11d1-80b4-00c04fd430c8.mpk`],
    ['trailing newline', `uploads/${h}/${uuid}.mpk\n`],
    ['nested path', `uploads/${h}/x/${uuid}.mpk`],
    ['wrong extension', `uploads/${h}/${uuid}.mpk.bak`],
    ['not a string', 42],
  ])('%s is refused', async (_n, object) => {
    refusedWith(
      await push(makeManifest({ _upload: { object } })),
      400,
      'invalid_upload'
    );
  });

  test('_upload without an object is refused', async () => {
    refusedWith(
      await push(makeManifest({ _upload: {} })),
      400,
      'invalid_upload'
    );
  });

  test('missing staging object is refused', async () => {
    refusedWith(
      await push(makeManifest({ _upload: { object: mine } })),
      400,
      'upload_not_found'
    );
  });

  test('the staged cap is 50 MiB', () => {
    expect(MAX_BUNDLE_BYTES).toBe(50 * 1024 * 1024);
  });

  test('oversize staging object is 413', async () => {
    mockObjects.set(mine, {
      data: Buffer.from('x'),
      size: MAX_BUNDLE_BYTES + 1,
    });
    const res = await push(makeManifest({ _upload: { object: mine } }));
    refusedWith(res, 413, 'payload_too_large');
    expect(mockObjects.has(mine)).toBe(false);
  });

  test('_binary together with _upload is refused', async () => {
    mockObjects.set(mine, { data: Buffer.from('x'), size: 1 });
    refusedWith(
      await push(makeManifest({ _binary: '00', _upload: { object: mine } })),
      400,
      'invalid_upload'
    );
  });

  test('a failed staging delete does not fail the publish', async () => {
    mockObjects.set(mine, { data: Buffer.from('x'), size: 1 });
    const orig = mockObjects.delete.bind(mockObjects);
    mockObjects.delete = name => {
      if (name === mine) throw new Error('boom');
      return orig(name);
    };
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await push(makeManifest({ _upload: { object: mine } }));
    mockObjects.delete = orig;
    expect(res.status).toHaveBeenCalledWith(201);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  test('a push with neither _binary nor _upload names both', async () => {
    const res = await push(makeManifest());
    refusedWith(res, 400, 'missing_binary');
    expect(res.json.mock.calls[0][0].message).toMatch(/upload-url.*_upload/);
  });

  test('legacy _binary push still works', async () => {
    const res = await push(makeManifest({ _binary: '00' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
