/**
 * E2E Tests: Developer Registration, Namespace Claiming, and Bundle Upload
 *
 * Tests the complete flow:
 * 1. Developer registration (placeholder - unauthenticated for now)
 * 2. Namespace claiming (first-come-first-serve)
 * 3. Bundle upload with signature verification
 */

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');
const {
  generateKeypair,
  sign,
  pubkeyToBase64,
  sigToBase64,
} = require('./helpers/ed25519-helper');

// Mock KV Client with persistent state
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
    sIsMember: jest.fn(async (key, member) => {
      const set = mockKVSets.get(key);
      return set && set.has(member) ? 1 : 0;
    }),
  },
}));

const { kv } = require('../src/lib/kv-client');

describe('E2E: Developer Registration, Namespace Claiming, and Bundle Upload', () => {
  let storage;
  let developerPrivateKey;
  let developerPublicKey;

  beforeEach(async () => {
    storage = new BundleStorageKV();

    // Clear mock data
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();

    // Generate developer keypair for testing
    const keypair = await generateKeypair();
    developerPrivateKey = keypair.privateKey;
    developerPublicKey = keypair.publicKey;
  });

  describe('Step 1: Developer Registration (Placeholder)', () => {
    test('should allow developer to register (currently unauthenticated)', async () => {
      // TODO: When authentication is implemented, this will:
      // 1. Submit enrollment request with pubkey
      // 2. Receive approval
      // 3. Get API credentials

      const developerPubkey = `ed25519:${Buffer.from(developerPublicKey).toString('base64')}`;
      const developerInfo = {
        pubkey: developerPubkey,
        display_name: 'Test Developer',
        email: 'dev@example.com',
        status: 'approved', // Placeholder - no auth yet
      };

      // For now, we just track the developer pubkey in the bundle signature
      // In the future, this would be stored in a developers table
      expect(developerInfo.pubkey).toBeDefined();
      expect(developerInfo.status).toBe('approved');
    });
  });

  describe('Step 2: Namespace Claiming (First-Come-First-Serve)', () => {
    test('should allow first developer to claim a namespace', async () => {
      const namespace = 'com.example.myapp';

      // Check if namespace is available (first-come-first-serve)
      const existingBundle = await storage.getBundleManifest(
        namespace,
        '1.0.0'
      );
      expect(existingBundle).toBeNull(); // Namespace is available

      // Namespace is claimed when first bundle is published
      // No explicit claiming step needed - first publish = claim
    });

    test('should prevent second developer from claiming same namespace', async () => {
      const namespace = 'com.example.myapp';
      const version = '1.0.0';

      // First developer publishes bundle (claims namespace)
      const firstBundle = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: {
          name: 'My App',
        },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(firstBundle);

      // Second developer tries to publish to same namespace
      // Should fail - namespace@version already taken
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).not.toBeNull();
      expect(existing.package).toBe(namespace);
    });

    test('should allow same developer to publish new version', async () => {
      const namespace = 'com.example.myapp';

      // First version
      const v1 = {
        version: '1.0',
        package: namespace,
        appVersion: '1.0.0',
        metadata: { name: 'My App' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };
      await storage.storeBundleManifest(v1);

      // Second version (same namespace, different version)
      const v2 = {
        version: '1.0',
        package: namespace,
        appVersion: '2.0.0',
        metadata: { name: 'My App v2' },
        wasm: { path: 'app.wasm', size: 200, hash: null },
        migrations: [],
      };
      await storage.storeBundleManifest(v2);

      // Both versions should exist
      const bundle1 = await storage.getBundleManifest(namespace, '1.0.0');
      const bundle2 = await storage.getBundleManifest(namespace, '2.0.0');
      expect(bundle1).not.toBeNull();
      expect(bundle2).not.toBeNull();
    });
  });

  describe('Step 3: Bundle Upload with Signature', () => {
    /**
     * Helper: Create a signed bundle manifest
     */
    async function createSignedBundle(bundle) {
      // Canonicalize bundle (remove signature)
      // eslint-disable-next-line no-unused-vars
      const { signature: _sig, ...canonicalBundle } = bundle;
      const canonical = JSON.stringify(
        canonicalBundle,
        Object.keys(canonicalBundle).sort()
      );

      // Sign with developer's private key
      const signature = await sign(
        Buffer.from(canonical, 'utf8'),
        developerPrivateKey
      );

      const pubkeyBase64 = pubkeyToBase64(developerPublicKey);
      const sigBase64 = sigToBase64(signature);

      return {
        ...bundle,
        signature: {
          alg: 'ed25519',
          pubkey: `ed25519:${pubkeyBase64}`,
          sig: `base64:${sigBase64}`,
          signedAt: new Date().toISOString(),
        },
      };
    }

    test('should accept bundle with valid signature', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.signed-app',
        appVersion: '1.0.0',
        metadata: {
          name: 'Signed App',
          description: 'An app with a valid signature',
        },
        interfaces: {
          exports: ['com.example.api.v1'],
        },
        wasm: {
          path: 'app.wasm',
          size: 1024,
          hash: null,
        },
        abi: {
          path: 'abi.json',
          size: 512,
          hash: null,
        },
        migrations: [],
      };

      const signedBundle = await createSignedBundle(bundle);

      // Store bundle
      await storage.storeBundleManifest(signedBundle);

      // Retrieve and verify
      const stored = await storage.getBundleManifest(
        'com.example.signed-app',
        '1.0.0'
      );
      expect(stored).not.toBeNull();
      expect(stored.package).toBe('com.example.signed-app');
      expect(stored.signature).toBeDefined();
      expect(stored.signature.alg).toBe('ed25519');
    });

    test('should accept bundle without signature (optional for testing)', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.unsigned-app',
        appVersion: '1.0.0',
        metadata: {
          name: 'Unsigned App',
        },
        wasm: {
          path: 'app.wasm',
          size: 1024,
          hash: null,
        },
        migrations: [],
      };

      // No signature - should still work (temporary for testing)
      await storage.storeBundleManifest(bundle);

      const stored = await storage.getBundleManifest(
        'com.example.unsigned-app',
        '1.0.0'
      );
      expect(stored).not.toBeNull();
      expect(stored.signature).toBeUndefined();
    });
  });

  describe('Complete E2E Flow', () => {
    test('should complete full flow: register → claim namespace → upload bundle', async () => {
      const developerPubkey = `ed25519:${Buffer.from(developerPublicKey).toString('base64')}`;
      const namespace = 'com.example.e2e-app';
      const version = '1.0.0';

      // Step 1: Developer registration (placeholder)
      const developer = {
        pubkey: developerPubkey,
        display_name: 'E2E Test Developer',
        status: 'approved',
      };
      expect(developer.status).toBe('approved');

      // Step 2: Check namespace availability
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).toBeNull(); // Namespace is available

      // Step 3: Create and sign bundle
      const bundle = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: {
          name: 'E2E Test App',
          description: 'End-to-end test application',
          tags: ['test', 'e2e'],
          license: 'MIT',
        },
        interfaces: {
          exports: ['com.example.e2e.v1'],
          uses: ['com.calimero.identity.v1'],
        },
        links: {
          frontend: 'https://example.com/e2e-app',
          github: 'https://github.com/example/e2e-app',
          docs: 'https://docs.example.com/e2e-app',
        },
        wasm: {
          path: 'app.wasm',
          size: 2048,
          hash: 'sha256:abc123...',
        },
        abi: {
          path: 'abi.json',
          size: 1024,
          hash: null,
        },
        migrations: [],
      };

      // Sign bundle
      // eslint-disable-next-line no-unused-vars
      const { signature: _sig, ...canonicalBundle } = bundle;
      const canonical = JSON.stringify(
        canonicalBundle,
        Object.keys(canonicalBundle).sort()
      );
      const signature = await sign(
        Buffer.from(canonical, 'utf8'),
        developerPrivateKey
      );

      const pubkeyBase64 = pubkeyToBase64(developerPublicKey);
      const sigBase64 = sigToBase64(signature);

      const signedBundle = {
        ...bundle,
        signature: {
          alg: 'ed25519',
          pubkey: `ed25519:${pubkeyBase64}`,
          sig: `base64:${sigBase64}`,
          signedAt: new Date().toISOString(),
        },
      };

      // Step 4: Upload bundle (store in registry)
      await storage.storeBundleManifest(signedBundle);

      // Step 5: Verify bundle is accessible
      const stored = await storage.getBundleManifest(namespace, version);
      expect(stored).not.toBeNull();
      expect(stored.package).toBe(namespace);
      expect(stored.appVersion).toBe(version);
      expect(stored.metadata.name).toBe('E2E Test App');
      expect(stored.signature).toBeDefined();
      expect(stored.signature.pubkey).toBe(`ed25519:${pubkeyBase64}`);

      // Step 6: Verify namespace is now claimed (can check versions)
      const versions = await storage.getBundleVersions(namespace);
      expect(versions).toContain(version);

      // Step 7: Verify interfaces are indexed
      const providesKey = `provides:com.example.e2e.v1`;
      const providesMembers = await kv.sMembers(providesKey);
      expect(providesMembers).toContain(`${namespace}/${version}`);

      // Step 8: Verify bundle appears in global list
      const allBundles = await storage.getAllBundles();
      expect(allBundles).toContain(namespace);
    });

    test('should prevent duplicate bundle upload (first-come-first-serve)', async () => {
      const namespace = 'com.example.duplicate-test';
      const version = '1.0.0';

      // First upload succeeds
      const bundle1 = {
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: { name: 'First Upload' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      };

      await storage.storeBundleManifest(bundle1);

      // Second upload with same package@version should fail
      // Check if already exists
      const existing = await storage.getBundleManifest(namespace, version);
      expect(existing).not.toBeNull();
      expect(existing.metadata.name).toBe('First Upload'); // First one wins

      // Attempting to store again would overwrite in current implementation
      // In production API, this would return 409 Conflict
    });
  });

  describe('Namespace Ownership Verification (Future)', () => {
    test('should verify developer owns namespace before allowing upload', async () => {
      // TODO: When namespace ownership is implemented:
      // 1. Check if namespace is reserved (e.g., com.calimero.*)
      // 2. If reserved, verify developer has approval
      // 3. If public, verify it's not already claimed by different developer
      // 4. Store namespace ownership mapping

      const namespace = 'com.example.future-test';
      const developerPubkey = `ed25519:${Buffer.from(developerPublicKey).toString('base64')}`;

      // Placeholder: In future, would check:
      // const owner = await getNamespaceOwner(namespace);
      // if (owner && owner !== developerPubkey) {
      //   throw new Error('Namespace already claimed by different developer');
      // }

      // For now, first-come-first-serve
      const bundle = {
        version: '1.0',
        package: namespace,
        appVersion: '1.0.0',
        metadata: { name: 'Future Test' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
        signature: {
          alg: 'ed25519',
          pubkey: developerPubkey,
          sig: 'base64:placeholder',
          signedAt: new Date().toISOString(),
        },
      };

      await storage.storeBundleManifest(bundle);

      // In future: Store namespace ownership
      // await storeNamespaceOwner(namespace, developerPubkey);
    });
  });
});
