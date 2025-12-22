/**
 * Bundle Storage Validation Tests
 *
 * Tests that validate the fix for unvalidated interfaces field
 * that could cause partial storage on error.
 */

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');

// Mock KV Client
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

describe('Bundle Storage Validation', () => {
  let storage;

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  describe('interfaces field validation', () => {
    test('should reject non-array interfaces.exports', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        interfaces: {
          exports: 123, // Invalid: not an array
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await expect(storage.storeBundleManifest(bundle)).rejects.toThrow(
        'Invalid interfaces.exports: must be an array or undefined/null'
      );

      // Verify manifest was NOT stored
      expect(kv.setNX).not.toHaveBeenCalled();
    });

    test('should reject non-array interfaces.uses', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        interfaces: {
          uses: 'not-an-array', // Invalid: not an array
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await expect(storage.storeBundleManifest(bundle)).rejects.toThrow(
        'Invalid interfaces.uses: must be an array or undefined/null'
      );

      // Verify manifest was NOT stored
      expect(kv.setNX).not.toHaveBeenCalled();
    });

    test('should accept null interfaces.exports', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        interfaces: {
          exports: null, // Valid: null is allowed
          uses: [],
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // Verify manifest was stored using atomic setNX
      expect(kv.setNX).toHaveBeenCalled();
    });

    test('should accept undefined interfaces field', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        // interfaces field is undefined
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // Verify manifest was stored using atomic setNX
      expect(kv.setNX).toHaveBeenCalled();
    });

    test('should skip invalid interface names in exports', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        interfaces: {
          exports: ['valid.interface', '', 123, 'another.valid'],
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // Verify only valid interface names were indexed
      expect(kv.sAdd).toHaveBeenCalledWith(
        'provides:valid.interface',
        'com.example.test/1.0.0'
      );
      expect(kv.sAdd).toHaveBeenCalledWith(
        'provides:another.valid',
        'com.example.test/1.0.0'
      );

      // Empty string and number should be skipped
      const calls = kv.sAdd.mock.calls;
      const providesCalls = calls.filter(call =>
        call[0].startsWith('provides:')
      );
      expect(providesCalls.length).toBe(2); // Only 2 valid interfaces
    });

    test('should handle empty arrays', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        interfaces: {
          exports: [],
          uses: [],
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // Verify manifest was stored using atomic setNX
      expect(kv.setNX).toHaveBeenCalled();

      // Verify no interface indexing calls (empty arrays)
      const calls = kv.sAdd.mock.calls;
      const interfaceCalls = calls.filter(
        call => call[0].startsWith('provides:') || call[0].startsWith('uses:')
      );
      expect(interfaceCalls.length).toBe(0);
    });
  });
});
