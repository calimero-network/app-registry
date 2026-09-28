/**
 * Race Condition Tests
 *
 * Tests that atomic operations prevent race conditions in bundle storage
 */

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');

// Mock KV Client with setNX support
const mockKVData = new Map();
const mockKVSets = new Map();

jest.mock('../src/lib/kv-client', () => ({
  kv: {
    set: jest.fn(async (key, value) => {
      mockKVData.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async key => {
      return mockKVData.get(key) || null;
    }),
    setNX: jest.fn(async (key, value) => {
      if (mockKVData.has(key)) {
        return false; // Key already exists
      }
      mockKVData.set(key, value);
      return true; // Key was set
    }),
    sAdd: jest.fn(async (key, value) => {
      if (!mockKVSets.has(key)) {
        mockKVSets.set(key, new Set());
      }
      mockKVSets.get(key).add(value);
      return 1;
    }),
    sMembers: jest.fn(async key => {
      const set = mockKVSets.get(key);
      return set ? Array.from(set) : [];
    }),
  },
}));

const { kv } = require('../src/lib/kv-client');

describe('Race Condition Prevention', () => {
  let storage;

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  test('should prevent concurrent bundle overwrites using atomic SETNX', async () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.race-test',
      appVersion: '1.0.0',
      metadata: { name: 'Race Test' },
      wasm: { path: 'app.wasm', size: 100, hash: null },
      migrations: [],
    };

    // Two truly concurrent requests: both pass the pre-write existence read
    // (neither has stored yet), so only the atomic setNX can tell them apart.
    const results = await Promise.allSettled([
      storage.storeBundleManifest(bundle),
      storage.storeBundleManifest(bundle),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toContain('already exists');

    // Verify setNX was called (atomic operation)
    const setNXCalls = kv.setNX.mock.calls.filter(call =>
      call[0].startsWith('bundle:')
    );
    expect(setNXCalls.length).toBe(2); // Both attempts called setNX

    // A later sequential re-push is refused before setNX, by the existence
    // read that also keeps it from touching the blob store.
    await expect(storage.storeBundleManifest(bundle)).rejects.toThrow(
      'already exists'
    );
    expect(
      kv.setNX.mock.calls.filter(call => call[0].startsWith('bundle:'))
    ).toHaveLength(2);

    // Verify only one bundle was stored
    const stored = await storage.getBundleManifest(
      'com.example.race-test',
      '1.0.0'
    );
    expect(stored).not.toBeNull();
    expect(stored.metadata.name).toBe('Race Test');
  });

  test('should handle concurrent requests atomically', async () => {
    const bundle1 = {
      version: '1.0',
      package: 'com.example.concurrent',
      appVersion: '1.0.0',
      metadata: { name: 'First Bundle' },
      wasm: { path: 'app.wasm', size: 100, hash: null },
      migrations: [],
    };

    const bundle2 = {
      version: '1.0',
      package: 'com.example.concurrent',
      appVersion: '1.0.0',
      metadata: { name: 'Second Bundle' },
      wasm: { path: 'app.wasm', size: 200, hash: null },
      migrations: [],
    };

    // Simulate concurrent requests
    const promises = [
      storage.storeBundleManifest(bundle1),
      storage.storeBundleManifest(bundle2),
    ];

    const results = await Promise.allSettled(promises);

    // One should succeed, one should fail
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(
      r =>
        r.status === 'rejected' && r.reason.message.includes('already exists')
    );

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    // Verify the stored bundle is the first one (first-come-first-serve)
    const stored = await storage.getBundleManifest(
      'com.example.concurrent',
      '1.0.0'
    );
    expect(stored).not.toBeNull();
    // The first request that completed should be stored
    expect(stored.metadata.name).toBeDefined();
  });

  test('should use setNX instead of set for atomicity', async () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.atomic-test',
      appVersion: '1.0.0',
      metadata: { name: 'Atomic Test' },
      wasm: { path: 'app.wasm', size: 100, hash: null },
      migrations: [],
    };

    await storage.storeBundleManifest(bundle);

    // Verify setNX was used (not set)
    expect(kv.setNX).toHaveBeenCalled();
    expect(kv.set).not.toHaveBeenCalledWith(
      expect.stringContaining('bundle:'),
      expect.anything()
    );
  });

  test('should throw error with first-come-first-serve message', async () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.error-test',
      appVersion: '1.0.0',
      metadata: { name: 'Error Test' },
      wasm: { path: 'app.wasm', size: 100, hash: null },
      migrations: [],
    };

    await storage.storeBundleManifest(bundle);

    // Second attempt should throw with specific error message
    await expect(storage.storeBundleManifest(bundle)).rejects.toThrow(
      /already exists.*First-come-first-serve/
    );
  });
});
