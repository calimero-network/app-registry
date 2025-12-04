/**
 * V2 Bundle Manifest Tests
 *
 * Tests the V2 bundle manifest storage logic.
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
        return 0; // Key already exists
      }
      mockKVData.set(key, value);
      return 1; // Key was set
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
    hGetAll: jest.fn().mockResolvedValue({}),
    hSet: jest.fn().mockResolvedValue(1),
    sIsMember: jest.fn().mockResolvedValue(0),
  },
}));

const { kv } = require('../src/lib/kv-client');

describe('V2 Bundle Manifest Storage', () => {
  let storage;

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  describe('storeBundleManifest', () => {
    test('should store a valid bundle manifest correctly', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.calimero.kv-store',
        appVersion: '1.0.0',
        metadata: {
          name: 'KV Store',
          description: 'Simple KV Store',
          tags: ['storage'],
          license: 'MIT',
        },
        interfaces: {
          exports: ['com.calimero.kv.v1'],
          uses: [],
        },
        links: {
          frontend: 'https://example.com',
        },
        wasm: {
          path: 'app.wasm',
          size: 100,
          hash: null,
        },
        abi: {
          path: 'abi.json',
          size: 50,
          hash: null,
        },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // 1. Verify manifest storage uses atomic setNX
      expect(kv.setNX).toHaveBeenCalledWith(
        'bundle:com.calimero.kv-store/1.0.0',
        expect.stringContaining('"package":"com.calimero.kv-store"')
      );

      // 2. Verify interface indexing
      expect(kv.sAdd).toHaveBeenCalledWith(
        'provides:com.calimero.kv.v1',
        'com.calimero.kv-store/1.0.0'
      );

      // 3. Verify version tracking
      expect(kv.sAdd).toHaveBeenCalledWith(
        'bundle-versions:com.calimero.kv-store',
        '1.0.0'
      );

      // 4. Verify global list
      expect(kv.sAdd).toHaveBeenCalledWith(
        'bundles:all',
        'com.calimero.kv-store'
      );
    });
  });

  describe('getBundleManifest', () => {
    test('should retrieve stored bundle manifest', async () => {
      const mockBundle = {
        json: {
          package: 'com.calimero.test',
          appVersion: '1.0.0',
        },
      };

      kv.get.mockResolvedValueOnce(JSON.stringify(mockBundle));

      const result = await storage.getBundleManifest(
        'com.calimero.test',
        '1.0.0'
      );

      expect(kv.get).toHaveBeenCalledWith('bundle:com.calimero.test/1.0.0');
      expect(result).toEqual(mockBundle.json);
    });

    test('should return null if manifest not found', async () => {
      kv.get.mockResolvedValueOnce(null);

      const result = await storage.getBundleManifest(
        'com.calimero.unknown',
        '1.0.0'
      );

      expect(result).toBeNull();
    });
  });
});
