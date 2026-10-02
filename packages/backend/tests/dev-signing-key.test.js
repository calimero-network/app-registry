const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const tar = require('tar');
const multibase = require('multibase');

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
  del: async k => (store.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async () => 0,
  sIsMember: async (k, m) => (sets.has(k) ? sets.get(k).has(String(m)) : false),
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
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async () => ({ id: 'dev', email: 'dev@example.com' }),
    requireAuth: async () => ({ id: 'dev', email: 'dev@example.com' }),
    canManagePackage: async () => true,
  };
});
jest.mock('../../../api/lib/admin-storage', () => ({
  isAdmin: async () => false,
  isBot: async () => false,
}));
jest.mock('../../../api/lib/user-storage', () => ({
  getUserByEmail: async () => ({ username: 'dev' }),
}));

const { TEST_ICON } = require('./helpers/publishable');
const { generateKeypair, signManifest } = require('./helpers/ed25519-helper');
const {
  DEV_SIGNING_PUBLIC_KEY,
  isDevSigningKey,
  devSigningKeyRefusal,
} = require('../src/lib/dev-signing-key');
const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const versionHandler = require('../../../api/v2/bundles/[package]/[version]');

const DEV_SEED = Buffer.from([
  0x8c, 0xb7, 0xae, 0x25, 0x1b, 0x4d, 0xa5, 0x5a, 0xec, 0xc3, 0x87, 0x5f, 0x4c,
  0x0a, 0x71, 0x2c, 0xe2, 0xb3, 0x4c, 0xb0, 0x6d, 0x47, 0x71, 0xe7, 0x13, 0xf2,
  0xbb, 0x32, 0x89, 0xd0, 0xf7, 0xb4,
]);

const PKG = 'com.example.devkey';

let devKeys;
let ownKeys;
let devPubkey;
let devSignerId;

beforeAll(async () => {
  const ed = await import('@noble/ed25519');
  const publicKey = await ed.getPublicKeyAsync(new Uint8Array(DEV_SEED));
  devKeys = { secretKey: new Uint8Array(DEV_SEED), publicKey };
  ownKeys = await generateKeypair();
  devPubkey = Buffer.from(publicKey).toString('base64url');
  devSignerId = `did:key:${Buffer.from(
    multibase.encode(
      'base58btc',
      Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(publicKey)])
    )
  ).toString()}`;
});

beforeEach(() => {
  store.clear();
  sets.clear();
});

function manifest(appVersion, extra = {}) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Dev Key',
      description: 'A package used to exercise the development key refusal.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'a'.repeat(64) },
    ...extra,
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
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

async function push(body) {
  const res = makeRes();
  await pushHandler({ method: 'POST', body, headers: {} }, res);
  return res;
}

function mpkRequest(signed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devkey-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(signed));
    const out = path.join(dir, 'bundle.mpk');
    tar.c({ gzip: true, file: out, cwd: dir, sync: true }, ['manifest.json']);
    const mpk = fs.readFileSync(out);
    const boundary = 'devkeyboundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="b.mpk"\r\nContent-Type: application/octet-stream\r\n\r\n`
      ),
      mpk,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = Readable.from([body]);
    req.method = 'POST';
    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    };
    return req;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the development key', () => {
  test('is the key mero-sign derives from its published seed', () => {
    expect(Buffer.from(devKeys.publicKey).equals(DEV_SIGNING_PUBLIC_KEY)).toBe(
      true
    );
    expect(devPubkey).toBe('c7yxmuCRXfb4Ab4kcl9M3D5lxcpG9BTZm7smM8jMdMI');
    expect(devSignerId).toBe(
      'did:key:z6MknF3p5L5FDHJQ7FREUapuX4Wmp4MtF6WrHYaXS2B3eZQd'
    );
  });

  test('is recognised in every encoding that decodes to its bytes', () => {
    const variants = [
      devPubkey,
      `${devPubkey}=`,
      `${devPubkey}!!`,
      ` ${devPubkey} `,
      `${devPubkey.slice(0, 10)}.${devPubkey.slice(10)}`,
      DEV_SIGNING_PUBLIC_KEY.toString('base64'),
      DEV_SIGNING_PUBLIC_KEY.toString('hex'),
      `u${devPubkey}`,
      Buffer.from(
        multibase.encode('base58btc', DEV_SIGNING_PUBLIC_KEY)
      ).toString(),
      Buffer.from(multibase.encode('base58btc', DEV_SIGNING_PUBLIC_KEY))
        .toString()
        .slice(1),
      devSignerId,
      devSignerId.slice('did:key:'.length),
    ];
    for (const v of variants)
      expect([v, isDevSigningKey(v)]).toEqual([v, true]);
  });

  test('is not confused with another key', () => {
    const own = Buffer.from(ownKeys.publicKey).toString('base64url');
    expect(isDevSigningKey(own)).toBe(false);
    expect(isDevSigningKey('')).toBe(false);
    expect(isDevSigningKey(undefined)).toBe(false);
    expect(isDevSigningKey({ publicKey: devPubkey })).toBe(false);
    expect(devSigningKeyRefusal(manifest('1.0.0', { owners: [own] }))).toBe(
      null
    );
  });
});

describe('push.js', () => {
  test('publishes a bundle signed with its own key', async () => {
    const res = await push(await signManifest(manifest('1.0.0'), ownKeys));
    expect(res.statusCode).toBe(201);
  });

  test('refuses a bundle signed with the development key', async () => {
    const res = await push(await signManifest(manifest('1.0.0'), devKeys));
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
    expect(res.body.message).toMatch(/--key/);
    expect(store.has(`bundle:${PKG}/1.0.0`)).toBe(false);
  });

  test('refuses the development key spelled with characters the decoder skips', async () => {
    const signed = await signManifest(manifest('1.0.0'), devKeys);
    signed.signature.publicKey = `${signed.signature.publicKey}!!`;
    const res = await push(signed);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
  });

  test('refuses a manifest that names the development key as an owner', async () => {
    const own = Buffer.from(ownKeys.publicKey).toString('base64url');
    const res = await push(
      await signManifest(
        manifest('1.0.0', { owners: [own, `${devPubkey}=`] }),
        ownKeys
      )
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
  });

  test('refuses a manifest whose signerId is the development key', async () => {
    const res = await push(
      await signManifest(manifest('1.0.0', { signerId: devSignerId }), ownKeys)
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
  });
});

describe('push-file.js', () => {
  test('refuses a .mpk signed with the development key', async () => {
    const res = makeRes();
    await pushFileHandler(
      mpkRequest(await signManifest(manifest('1.0.0'), devKeys)),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
    expect(store.has(`bundle:${PKG}/1.0.0`)).toBe(false);
  });

  test('reads past the check for a .mpk signed with its own key', async () => {
    const res = makeRes();
    await pushFileHandler(
      mpkRequest(await signManifest(manifest('1.0.0'), ownKeys)),
      res
    );
    expect(res.body?.error).not.toBe('dev_signing_key');
  });
});

describe('PATCH /api/v2/bundles/:package/:version', () => {
  async function patch(body) {
    const res = makeRes();
    await versionHandler(
      {
        method: 'PATCH',
        query: { package: PKG, version: '1.0.0' },
        headers: {},
        body,
      },
      res
    );
    return res;
  }

  test('refuses an edit signed with the development key', async () => {
    const res = await patch(await signManifest(manifest('1.0.0'), devKeys));
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('dev_signing_key');
  });

  test('reads past the check for an edit signed with another key', async () => {
    const res = await patch(await signManifest(manifest('1.0.0'), ownKeys));
    expect(res.statusCode).toBe(404);
  });
});

describe('every write path refuses the development key', () => {
  const ROOT = path.resolve(__dirname, '../../..');

  test.each([
    'api/v2/bundles/push.js',
    'api/v2/bundles/push-file.js',
    'api/v2/bundles/[package]/[version].js',
    'packages/backend/src/server.js',
  ])('%s calls devSigningKeyRefusal', rel => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src.match(/devSigningKeyRefusal\(/g)?.length).toBeGreaterThan(0);
  });

  test('the dev server checks both its publish and its edit path', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'packages/backend/src/server.js'),
      'utf8'
    );
    expect(src.match(/devSigningKeyRefusal\(/g)).toHaveLength(2);
  });
});
