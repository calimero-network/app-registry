/**
 * Bundle integrity: a published package@version cannot have its binary
 * replaced by replaying its public, signed manifest with other bytes.
 *
 * The attack this pins: download a public .mpk, take its signed manifest.json,
 * and push it back with `_binary` set to an attacker's archive. The signature
 * excludes `_binary`, and the blob used to be written to the bucket BEFORE the
 * "version already exists" refusal, so the swap landed even though the push
 * answered 500.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');

const mockKVData = new Map();
const mockKVSets = new Map();

jest.mock('../src/lib/kv-client', () => ({
  kv: {
    set: jest.fn(async (key, value) => {
      mockKVData.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async key => mockKVData.get(key) || null),
    setNX: jest.fn(async (key, value) => {
      if (mockKVData.has(key)) return false;
      mockKVData.set(key, value);
      return true;
    }),
    sAdd: jest.fn(async (key, value) => {
      if (!mockKVSets.has(key)) mockKVSets.set(key, new Set());
      mockKVSets.get(key).add(value);
      return 1;
    }),
    sMembers: jest.fn(async key => Array.from(mockKVSets.get(key) || [])),
  },
}));

const mockBlobs = new Map();
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async (key, buf, { createOnly } = {}) => {
    if (createOnly && mockBlobs.has(key)) {
      const err = new Error(`Blob ${key} already exists`);
      err.code = 'blob_exists';
      throw err;
    }
    mockBlobs.set(key, buf);
    return '1';
  }),
  getBinary: jest.fn(async key => mockBlobs.get(key) || null),
  deleteBinary: jest.fn(async key => {
    mockBlobs.delete(key);
  }),
}));

const blob = require('../src/lib/blob-store');
const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');
const {
  verifyBundleBinary,
  BundleIntegrityError,
  storeRefusal,
} = require('../src/lib/bundle-integrity');
const { generateKeypair, signManifest } = require('./helpers/ed25519-helper');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** Pack {name: Buffer|string} into a gzip'd tar, in order. */
function pack(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpk-test-'));
  try {
    for (const [name, data] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), data);
    }
    const out = path.join(dir, 'bundle.mpk');
    tar.c({ gzip: true, file: out, cwd: dir, sync: true }, Object.keys(files));
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A signed manifest plus the .mpk it describes, the way cargo-mero ships it. */
async function signedBundle(keys, { version = '1.0.0', extra = {} } = {}) {
  const wasm = crypto.randomBytes(256);
  const abi = Buffer.from('{"methods":[]}');
  const manifest = await signManifest(
    {
      version: '1.0',
      package: 'com.example.integrity',
      appVersion: version,
      wasm: { path: 'app.wasm', hash: sha256(wasm), size: wasm.length },
      abi: { path: 'abi.json', hash: sha256(abi), size: abi.length },
      migrations: [],
      ...extra,
    },
    keys
  );
  const files = {
    'manifest.json': JSON.stringify(manifest),
    'app.wasm': wasm,
    'abi.json': abi,
  };
  return { manifest, files, mpk: pack(files) };
}

describe('verifyBundleBinary', () => {
  let keys;
  beforeAll(async () => {
    keys = await generateKeypair();
  });

  test('accepts the bundle the manifest signed', async () => {
    const { manifest, mpk } = await signedBundle(keys);
    await expect(verifyBundleBinary(manifest, mpk)).resolves.toBeTruthy();
  });

  test('accepts a pushed manifest the server has since stamped', async () => {
    // push.js rewrites metadata.author / _ownerEmail before storage, so the
    // pushed object is no longer byte-identical to the signed one.
    const { manifest, mpk } = await signedBundle(keys);
    const stamped = {
      ...manifest,
      metadata: { author: 'someone', _ownerEmail: 'a@b.c' },
      _publishedAt: 'now',
    };
    await expect(verifyBundleBinary(stamped, mpk)).resolves.toBeTruthy();
  });

  test('refuses a replayed manifest carrying different wasm', async () => {
    const { manifest, files } = await signedBundle(keys);
    const evil = pack({ ...files, 'app.wasm': crypto.randomBytes(256) });
    await expect(verifyBundleBinary(manifest, evil)).rejects.toThrow(
      /wasm \(app\.wasm\) does not match its signed sha256/
    );
  });

  test('refuses a swapped abi', async () => {
    const { manifest, files } = await signedBundle(keys);
    const evil = pack({ ...files, 'abi.json': '{"methods":["x"]}' });
    await expect(verifyBundleBinary(manifest, evil)).rejects.toThrow(
      /abi \(abi\.json\)/
    );
  });

  test('refuses a file the signed manifest does not reference', async () => {
    const { manifest, files } = await signedBundle(keys);
    const evil = pack({ ...files, 'frontend/index.js': 'alert(1)' });
    await expect(verifyBundleBinary(manifest, evil)).rejects.toThrow(
      /does not reference/
    );
  });

  test('refuses an archive whose manifest.json was rewritten', async () => {
    const { manifest, files } = await signedBundle(keys);
    const wasm = crypto.randomBytes(256);
    const inner = {
      ...manifest,
      wasm: { path: 'app.wasm', hash: sha256(wasm), size: wasm.length },
    };
    const evil = pack({
      ...files,
      'manifest.json': JSON.stringify(inner),
      'app.wasm': wasm,
    });
    await expect(verifyBundleBinary(manifest, evil)).rejects.toThrow(
      /signature does not verify/
    );
  });

  test('refuses an archive signed by someone else', async () => {
    const { manifest } = await signedBundle(keys);
    const other = await signedBundle(await generateKeypair());
    await expect(verifyBundleBinary(manifest, other.mpk)).rejects.toThrow(
      /not signed with the signature that was pushed/
    );
  });

  test('refuses an archive without manifest.json', async () => {
    const { manifest, files } = await signedBundle(keys);
    const noManifest = { ...files };
    delete noManifest['manifest.json'];
    await expect(
      verifyBundleBinary(manifest, pack(noManifest))
    ).rejects.toThrow(/must contain manifest\.json/);
  });

  test('refuses bytes that are not an archive', async () => {
    const { manifest } = await signedBundle(keys);
    await expect(
      verifyBundleBinary(manifest, Buffer.from('not a tarball'))
    ).rejects.toBeInstanceOf(BundleIntegrityError);
  });

  test('checks every service artifact', async () => {
    const svc = crypto.randomBytes(64);
    const manifest = await signManifest(
      {
        version: '1.0',
        package: 'com.example.services',
        appVersion: '1.0.0',
        services: [
          {
            name: 'lobby',
            wasm: {
              path: 'services/lobby.wasm',
              hash: sha256(svc),
              size: svc.length,
            },
          },
        ],
        migrations: [],
      },
      keys
    );
    const files = {
      'manifest.json': JSON.stringify(manifest),
      'services/lobby.wasm': svc,
    };
    await expect(
      verifyBundleBinary(manifest, pack(files))
    ).resolves.toBeTruthy();
    const evil = pack({
      ...files,
      'services/lobby.wasm': crypto.randomBytes(64),
    });
    await expect(verifyBundleBinary(manifest, evil)).rejects.toThrow(
      /service "lobby" wasm/
    );
  });
});

describe('storeBundleManifest never replaces a published binary', () => {
  let keys;
  let storage;
  beforeAll(async () => {
    keys = await generateKeypair();
  });
  beforeEach(() => {
    mockKVData.clear();
    mockKVSets.clear();
    mockBlobs.clear();
    jest.clearAllMocks();
    storage = new BundleStorageKV();
  });

  test('a replay with other bytes is refused before anything is written', async () => {
    const { manifest, files, mpk } = await signedBundle(keys);
    await storage.storeBundleManifest({
      ...manifest,
      _binary: mpk.toString('hex'),
    });
    expect(blob.putBinary).toHaveBeenCalledTimes(1);

    const evil = pack({ ...files, 'app.wasm': crypto.randomBytes(256) });
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: evil.toString('hex'),
      })
    ).rejects.toBeInstanceOf(BundleIntegrityError);

    expect(blob.putBinary).toHaveBeenCalledTimes(1);
    expect(mockBlobs.get('com.example.integrity/1.0.0').equals(mpk)).toBe(true);
  });

  test('re-pushing the genuine bundle is refused and never touches the bucket', async () => {
    const { manifest, mpk } = await signedBundle(keys);
    const push = () =>
      storage.storeBundleManifest({
        ...manifest,
        _binary: mpk.toString('hex'),
      });
    await push();
    await expect(push()).rejects.toThrow(/already exists/);
    expect(blob.putBinary).toHaveBeenCalledTimes(1);
  });

  test('the bucket write is create-only unless overwrite is configured', async () => {
    const { manifest, mpk } = await signedBundle(keys);
    await storage.storeBundleManifest({
      ...manifest,
      _binary: mpk.toString('hex'),
    });
    expect(blob.putBinary).toHaveBeenCalledWith(
      'com.example.integrity/1.0.0',
      expect.any(Buffer),
      { createOnly: true }
    );
  });

  test('a bucket collision the KV read missed still refuses, and leaves the blob', async () => {
    // A legacy or racing object already in the bucket: the GCS precondition
    // is the backstop, and the existing object must survive.
    const { manifest, mpk } = await signedBundle(keys);
    const original = Buffer.from('original');
    mockBlobs.set('com.example.integrity/1.0.0', original);
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: mpk.toString('hex'),
      })
    ).rejects.toThrow(/already exists/);
    expect(mockBlobs.get('com.example.integrity/1.0.0')).toBe(original);
    expect(mockKVData.has('bundle:com.example.integrity/1.0.0')).toBe(false);
  });

  test('losing the setNX race removes only the blob this call created', async () => {
    const { manifest, mpk } = await signedBundle(keys);
    const { kv } = require('../src/lib/kv-client');
    kv.setNX.mockImplementationOnce(async () => false);
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: mpk.toString('hex'),
      })
    ).rejects.toThrow(/already exists/);
    expect(blob.deleteBinary).toHaveBeenCalledWith(
      'com.example.integrity/1.0.0',
      { ifGeneration: '1' }
    );
  });

  test('a non-hex binary is refused', async () => {
    const { manifest } = await signedBundle(keys);
    await expect(
      storage.storeBundleManifest({ ...manifest, _binary: 'zz' })
    ).rejects.toBeInstanceOf(BundleIntegrityError);
    expect(blob.putBinary).not.toHaveBeenCalled();
  });
});

describe('storeRefusal', () => {
  test('integrity failures are 400, an existing version is 409', () => {
    expect(storeRefusal(new BundleIntegrityError('x')).status).toBe(400);
    expect(
      storeRefusal(
        new Error('Bundle a@1 already exists. First-come-first-serve policy.')
      ).status
    ).toBe(409);
    expect(storeRefusal(new Error('redis down'))).toBeNull();
  });
});
