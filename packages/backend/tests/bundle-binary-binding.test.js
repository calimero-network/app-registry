/**
 * A published version's bytes are bound to its signed manifest and immutable.
 *
 * `_binary` sits outside the signature, so these pin the two things that make
 * it trustworthy anyway: the archive must carry the signed manifest and
 * artifacts that hash to it, and the bucket write is create-only.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');

const mockKVData = new Map();
const mockKVSets = new Map();
const mockBlobs = new Map();

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

// Behaves like the bucket: a create-only write to an existing object fails 412.
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async (key, buffer, { overwrite = false } = {}) => {
    if (!overwrite && mockBlobs.has(key)) {
      const err = new Error('Precondition Failed');
      err.code = 412;
      throw err;
    }
    mockBlobs.set(key, Buffer.from(buffer));
  }),
  getBinary: jest.fn(async key => mockBlobs.get(key) || null),
  isPreconditionFailed: err => err?.code === 412,
}));

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');
const { assertBinaryMatchesManifest } = require('../src/lib/bundle-binary');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const WASM = Buffer.from('\0asm\x01\0\0\0original');
const OTHER_WASM = Buffer.from('\0asm\x01\0\0\0replaced');

function manifestFor(wasm, overrides = {}) {
  return {
    version: '1.0',
    package: 'com.example.bound',
    appVersion: '1.0.0',
    metadata: { name: 'Bound' },
    wasm: { path: 'app.wasm', hash: sha256(wasm), size: wasm.length },
    migrations: [],
    signature: { algorithm: 'ed25519', publicKey: 'pk', signature: 'sig-1' },
    ...overrides,
  };
}

/** A gzipped tar holding `files` ({ name: Buffer|string }). */
function mpk(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpk-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    const out = path.join(dir, 'out.mpk');
    tar.c({ gzip: true, cwd: dir, sync: true, file: out }, Object.keys(files));
    return fs.readFileSync(out);
  } finally {
    // out.mpk has been read; the directory is scratch.
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const bundleOf = (manifest, wasm) =>
  mpk({ 'manifest.json': JSON.stringify(manifest), 'app.wasm': wasm });

describe('assertBinaryMatchesManifest', () => {
  test('accepts the bundle the manifest was signed for', async () => {
    const manifest = manifestFor(WASM);
    await expect(
      assertBinaryMatchesManifest(bundleOf(manifest, WASM), manifest)
    ).resolves.toBeUndefined();
  });

  test('accepts metadata the publish route stamped after signing', async () => {
    const signed = manifestFor(WASM);
    const stamped = {
      ...signed,
      metadata: { ...signed.metadata, author: 'alice', _ownerEmail: 'a@x.io' },
    };
    await expect(
      assertBinaryMatchesManifest(bundleOf(signed, WASM), stamped)
    ).resolves.toBeUndefined();
  });

  test('rejects wasm that does not hash to the signed value', async () => {
    const manifest = manifestFor(WASM);
    await expect(
      assertBinaryMatchesManifest(bundleOf(manifest, OTHER_WASM), manifest)
    ).rejects.toThrow('does not match its manifest hash');
  });

  test('rejects an archive carrying a different manifest', async () => {
    const signed = manifestFor(WASM);
    const inner = manifestFor(OTHER_WASM);
    await expect(
      assertBinaryMatchesManifest(bundleOf(inner, OTHER_WASM), signed)
    ).rejects.toThrow('does not match the manifest it was published with');
  });

  test('rejects raw wasm in place of a bundle', async () => {
    await expect(
      assertBinaryMatchesManifest(WASM, manifestFor(WASM))
    ).rejects.toThrow('not a gzipped archive');
  });

  test('rejects a bundle missing its wasm', async () => {
    const manifest = manifestFor(WASM);
    await expect(
      assertBinaryMatchesManifest(
        mpk({ 'manifest.json': JSON.stringify(manifest) }),
        manifest
      )
    ).rejects.toThrow('missing app.wasm');
  });
});

describe('storeBundleManifest keeps published bytes immutable', () => {
  let storage;
  const key = 'com.example.bound/1.0.0';

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    mockBlobs.clear();
    jest.clearAllMocks();
  });

  test('re-pushing a published manifest with other bytes leaves them unchanged', async () => {
    const manifest = manifestFor(WASM);
    const original = bundleOf(manifest, WASM);
    await storage.storeBundleManifest({
      ...manifest,
      _binary: original.toString('hex'),
    });

    const swapped = bundleOf(manifest, OTHER_WASM);
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: swapped.toString('hex'),
      })
    ).rejects.toThrow();

    expect(mockBlobs.get(key).equals(original)).toBe(true);
  });

  test('a duplicate push is refused even when bytes check out', async () => {
    const manifest = manifestFor(WASM);
    const bytes = bundleOf(manifest, WASM).toString('hex');
    await storage.storeBundleManifest({ ...manifest, _binary: bytes });
    await expect(
      storage.storeBundleManifest({ ...manifest, _binary: bytes })
    ).rejects.toThrow('already exists');
  });

  test('an orphaned object is completed only with identical bytes', async () => {
    const manifest = manifestFor(WASM);
    const original = bundleOf(manifest, WASM);

    // A push that died after the upload, before the manifest was written.
    mockBlobs.set(key, bundleOf(manifestFor(OTHER_WASM), OTHER_WASM));
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: original.toString('hex'),
      })
    ).rejects.toThrow('already exists');

    mockBlobs.set(key, original);
    await expect(
      storage.storeBundleManifest({
        ...manifest,
        _binary: original.toString('hex'),
      })
    ).resolves.not.toThrow();
  });

  test('concurrent pushes of one version store exactly one', async () => {
    const manifest = manifestFor(WASM);
    const bytes = bundleOf(manifest, WASM).toString('hex');
    const results = await Promise.allSettled([
      storage.storeBundleManifest({ ...manifest, _binary: bytes }),
      storage.storeBundleManifest({ ...manifest, _binary: bytes }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
});
