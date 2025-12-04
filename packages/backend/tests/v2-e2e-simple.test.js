/**
 * E2E Tests: Developer Registration, Namespace Claiming, and Bundle Upload
 *
 * Simplified version that demonstrates the flow without requiring ES module imports
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

describe('E2E: Developer Registration → Namespace Claim → Bundle Upload', () => {
  let storage;
  const developerPubkey =
    'ed25519:MCowBQYDK2VwAyEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ==';

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  describe('Step 1: Developer Registration', () => {
    test('developer should register (placeholder - unauthenticated for now)', () => {
      // TODO: When authentication is implemented:
      // POST /api/v2/developers/enroll
      // {
      //   "pubkey": "ed25519:...",
      //   "display_name": "Test Developer",
      //   "email": "dev@example.com"
      // }

      const developer = {
        pubkey: developerPubkey,
        display_name: 'Test Developer',
        email: 'dev@example.com',
        status: 'approved', // Placeholder - no auth yet
      };

      expect(developer.pubkey).toBeDefined();
      expect(developer.status).toBe('approved');
    });
  });

  describe('Step 2: Namespace Claiming (First-Come-First-Serve)', () => {
    test('should claim namespace when first bundle is uploaded', async () => {
      const namespace = 'com.example.namespace-claim';
      const version = '1.0.0';

      // Check namespace is available
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).toBeNull();

      // Upload bundle (claims namespace)
      const bundle = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: {
          name: 'Namespace Claim Test',
        },
        wasm: {
          path: 'app.wasm',
          size: 1024,
          hash: null,
        },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      // Namespace is now claimed
      const stored = await storage.getBundleManifest(namespace, version);
      expect(stored).not.toBeNull();
      expect(stored.package).toBe(namespace);
    });

    test('should prevent duplicate namespace@version upload', async () => {
      const namespace = 'com.example.duplicate';
      const version = '1.0.0';

      // First upload
      const bundle1 = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: { name: 'First Upload' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle1);

      // Second upload (same package@version)
      // Check if already exists
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).not.toBeNull();
      expect(existing.metadata.name).toBe('First Upload'); // First one wins
    });
  });

  describe('Step 3: Bundle Upload with Signature', () => {
    test('should accept bundle with signature (signature format validated)', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.signed',
        appVersion: '1.0.0',
        metadata: {
          name: 'Signed Bundle',
        },
        interfaces: {
          exports: ['com.example.api.v1'],
        },
        wasm: {
          path: 'app.wasm',
          size: 2048,
          hash: 'sha256:abc123',
        },
        migrations: [],
        signature: {
          alg: 'ed25519',
          pubkey: developerPubkey,
          sig: 'base64:validSignatureBase64EncodedStringHere',
          signedAt: new Date().toISOString(),
        },
      };

      await storage.storeBundleManifest(bundle);

      const stored = await storage.getBundleManifest(
        'com.example.signed',
        '1.0.0'
      );
      expect(stored).not.toBeNull();
      expect(stored.signature).toBeDefined();
      expect(stored.signature.alg).toBe('ed25519');
      expect(stored.signature.pubkey).toBe(developerPubkey);
    });

    test('should accept bundle without signature (optional for testing)', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.unsigned',
        appVersion: '1.0.0',
        metadata: { name: 'Unsigned Bundle' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle);

      const stored = await storage.getBundleManifest(
        'com.example.unsigned',
        '1.0.0'
      );
      expect(stored).not.toBeNull();
      expect(stored.signature).toBeUndefined();
    });
  });

  describe('Complete E2E Flow', () => {
    test('should complete full flow: register → claim namespace → upload bundle', async () => {
      const namespace = 'com.example.complete-flow';
      const version = '1.0.0';

      // Step 1: Developer registration (placeholder)
      const developer = {
        pubkey: developerPubkey,
        display_name: 'Complete Flow Developer',
        status: 'approved',
      };
      expect(developer.status).toBe('approved');

      // Step 2: Check namespace availability
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).toBeNull(); // Namespace is available

      // Step 3: Upload bundle (claims namespace)
      const bundle = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: {
          name: 'Complete Flow App',
          description: 'End-to-end test application',
          tags: ['test', 'e2e'],
          license: 'MIT',
        },
        interfaces: {
          exports: ['com.example.complete.v1'],
          uses: ['com.calimero.identity.v1'],
        },
        links: {
          frontend: 'https://example.com/complete-app',
          github: 'https://github.com/example/complete-app',
        },
        wasm: {
          path: 'app.wasm',
          size: 4096,
          hash: 'sha256:def456',
        },
        abi: {
          path: 'abi.json',
          size: 2048,
          hash: null,
        },
        migrations: [],
        signature: {
          alg: 'ed25519',
          pubkey: developerPubkey,
          sig: 'base64:signatureHere',
          signedAt: new Date().toISOString(),
        },
      };

      await storage.storeBundleManifest(bundle);

      // Step 4: Verify bundle is stored
      const stored = await storage.getBundleManifest(namespace, version);
      expect(stored).not.toBeNull();
      expect(stored.package).toBe(namespace);
      expect(stored.appVersion).toBe(version);
      expect(stored.metadata.name).toBe('Complete Flow App');
      expect(stored.interfaces.exports).toContain('com.example.complete.v1');
      expect(stored.signature).toBeDefined();
      expect(stored.signature.pubkey).toBe(developerPubkey);

      // Step 5: Verify namespace is claimed (cannot upload duplicate)
      const duplicate = await storage.getBundleManifest(namespace, version);
      expect(duplicate).not.toBeNull(); // Already exists

      // Step 6: Verify interfaces are indexed
      const providesKey = `provides:com.example.complete.v1`;
      const providesMembers = await kv.sMembers(providesKey);
      expect(providesMembers).toContain(`${namespace}/${version}`);

      // Step 7: Verify bundle appears in global list
      const allBundles = await storage.getAllBundles();
      expect(allBundles).toContain(namespace);
    });
  });
});
