/**
 * Multi-service bundle storage tests.
 *
 * Verifies that the optional `services` array round-trips through storage
 * untouched, that single-app bundles are unaffected (backward compat), and
 * that malformed `services` are rejected before any partial write.
 */

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');

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
    sMembers: jest.fn(async key => {
      const set = mockKVSets.get(key);
      return set ? Array.from(set) : [];
    }),
  },
}));

// Mock the blob store so any test that adds `_binary` to a manifest doesn't hit
// real GCS (which throws when GCS_BUCKET is unset, e.g. in CI).
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async () => {}),
  getBinary: jest.fn(async () => null),
}));

const { kv } = require('../src/lib/kv-client');

const baseManifest = () => ({
  version: '1.0',
  package: 'com.calimero.ttt',
  appVersion: '1.0.0',
  wasm: { path: 'app.wasm', hash: 'mainhash', size: 100 },
  migrations: [],
});

const sampleServices = () => [
  {
    name: 'lobby',
    wasm: { path: 'services/lobby.wasm', hash: 'lobbyhash', size: 50 },
    abi: { path: 'services/lobby.abi.json', hash: 'lobbyabi', size: 10 },
  },
  {
    name: 'chat',
    wasm: { path: 'services/chat.wasm', hash: 'chathash', size: 60 },
  },
];

describe('Multi-service bundle storage', () => {
  let storage;

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  test('round-trips a manifest with services intact', async () => {
    const manifest = { ...baseManifest(), services: sampleServices() };
    await storage.storeBundleManifest(manifest);

    const got = await storage.getBundleManifest('com.calimero.ttt', '1.0.0');
    expect(got.services).toEqual(sampleServices());
    // Main app preserved alongside services.
    expect(got.wasm).toEqual({ path: 'app.wasm', hash: 'mainhash', size: 100 });
  });

  test('single-app bundle stores without a services field (backward compat)', async () => {
    await storage.storeBundleManifest(baseManifest());
    const got = await storage.getBundleManifest('com.calimero.ttt', '1.0.0');
    expect(got.services).toBeUndefined();
    expect(got.wasm.path).toBe('app.wasm');
  });

  test('rejects non-array services', async () => {
    const manifest = { ...baseManifest(), services: { name: 'lobby' } };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      'Invalid services: must be an array or undefined/null'
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects a service without a name', async () => {
    const manifest = {
      ...baseManifest(),
      services: [{ wasm: { path: 'services/x.wasm', hash: 'h', size: 1 } }],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      'Invalid service: missing or empty name'
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects a service without a wasm artifact', async () => {
    const manifest = {
      ...baseManifest(),
      services: [{ name: 'lobby' }],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      'Invalid service "lobby": missing wasm artifact'
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects a service whose wasm is an array, not an object', async () => {
    const manifest = {
      ...baseManifest(),
      services: [{ name: 'lobby', wasm: [] }],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      'Invalid service "lobby": missing wasm artifact'
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects duplicate service names', async () => {
    const manifest = {
      ...baseManifest(),
      services: [
        {
          name: 'lobby',
          wasm: { path: 'services/lobby.wasm', hash: 'h', size: 1 },
        },
        {
          name: 'lobby',
          wasm: { path: 'services/lobby2.wasm', hash: 'h', size: 2 },
        },
      ],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      'Invalid service: duplicate name "lobby"'
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects a service name that violates the charset (e.g. traversal/uppercase)', async () => {
    // Each iteration is independent: clear state + assert per-name so a name
    // that wrongly slipped through couldn't be masked by a later "already
    // exists" error or a single end-of-loop assertion.
    for (const bad of ['../evil', 'Lobby', 'has space', ' lobby ', 'app']) {
      mockKVData.clear();
      mockKVSets.clear();
      jest.clearAllMocks();
      const manifest = {
        ...baseManifest(),
        services: [{ name: bad, wasm: { path: 'x.wasm', hash: 'h', size: 1 } }],
      };
      await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
        /Invalid service name/
      );
      expect(kv.setNX).not.toHaveBeenCalled();
    }
  });

  test('rejects a service name longer than 64 characters', async () => {
    const manifest = {
      ...baseManifest(),
      services: [
        { name: 'a'.repeat(65), wasm: { path: 'x.wasm', hash: 'h', size: 1 } },
      ],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      /Invalid service name/
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects an unsafe service wasm.path', async () => {
    const manifest = {
      ...baseManifest(),
      services: [
        {
          name: 'lobby',
          wasm: { path: '../../etc/passwd', hash: 'h', size: 1 },
        },
      ],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      /wasm.path .* under services\//
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects a service wasm.path not under services/ (collision with app.wasm)', async () => {
    const manifest = {
      ...baseManifest(),
      services: [
        { name: 'lobby', wasm: { path: 'app.wasm', hash: 'h', size: 1 } },
      ],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      /wasm.path .* under services\//
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });

  test('rejects an unsafe service abi.path', async () => {
    const manifest = {
      ...baseManifest(),
      services: [
        {
          name: 'lobby',
          wasm: { path: 'services/lobby.wasm', hash: 'h', size: 1 },
          abi: { path: '/etc/shadow', hash: 'h', size: 1 },
        },
      ],
    };
    await expect(storage.storeBundleManifest(manifest)).rejects.toThrow(
      /abi.path .* under services\//
    );
    expect(kv.setNX).not.toHaveBeenCalled();
  });
});
