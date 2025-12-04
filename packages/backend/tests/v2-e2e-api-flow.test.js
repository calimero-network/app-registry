/**
 * E2E API Tests: Complete Developer Flow via HTTP API
 *
 * Tests the complete flow through the actual API endpoints:
 * 1. Developer registration (placeholder)
 * 2. Namespace claiming via bundle upload
 * 3. Bundle upload with signature verification
 * 4. Bundle retrieval
 */

const {
  generateKeypair,
  sign,
  pubkeyToBase64,
  sigToBase64,
} = require('./helpers/ed25519-helper');

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

// Import push endpoint handler (from registry root)
const pushHandler = require('../../../api/v2/bundles/push');
const getHandler = require('../../../api/v2/bundles/[package]/[version]');

describe('E2E API Flow: Developer Registration → Namespace Claim → Bundle Upload', () => {
  let developerPrivateKey;
  let developerPublicKey;
  let req;
  let res;

  beforeEach(async () => {
    // Clear mock data
    mockKVData.clear();
    mockKVSets.clear();
    jest.clearAllMocks();

    // Generate developer keypair
    const keypair = await generateKeypair();
    developerPrivateKey = keypair.privateKey;
    developerPublicKey = keypair.publicKey;

    // Mock request/response objects
    req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  /**
   * Helper: Create a signed bundle manifest
   */
  async function createSignedBundle(bundle) {
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

  describe('Step 1: Developer Registration (Placeholder)', () => {
    test('developer should be able to register', () => {
      // TODO: When implemented, this would be:
      // POST /api/v2/developers/enroll
      // {
      //   "pubkey": "ed25519:...",
      //   "display_name": "Test Developer",
      //   "email": "dev@example.com"
      // }

      const developerPubkey = `ed25519:${Buffer.from(developerPublicKey).toString('base64')}`;

      expect(developerPubkey).toMatch(/^ed25519:/);
      expect(developerPubkey.length).toBeGreaterThan(50);
    });
  });

  describe('Step 2: Namespace Claiming via Bundle Upload', () => {
    test('should claim namespace when first bundle is uploaded', async () => {
      const namespace = 'com.example.namespace-claim';
      const version = '1.0.0';

      const bundle = await createSignedBundle({
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
      });

      req.body = bundle;
      await pushHandler(req, res);

      // Should succeed (namespace claimed)
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          package: namespace,
          version,
        })
      );
    });

    test('should prevent duplicate namespace@version upload', async () => {
      const namespace = 'com.example.duplicate';
      const version = '1.0.0';

      const bundle1 = await createSignedBundle({
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: { name: 'First' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      });

      // First upload
      req.body = bundle1;
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);

      // Reset mocks
      res.status.mockClear();
      res.json.mockClear();

      // Second upload (same package@version)
      const bundle2 = await createSignedBundle({
        version: '1.0',
        package: namespace,
        appVersion: version, // Same version
        metadata: { name: 'Second' },
        wasm: { path: 'app.wasm', size: 200, hash: null },
        migrations: [],
      });

      req.body = bundle2;
      await pushHandler(req, res);

      // Should fail with 409 Conflict
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'bundle_exists',
        })
      );
    });
  });

  describe('Step 3: Bundle Upload with Signature Verification', () => {
    test('should accept bundle with valid signature', async () => {
      const bundle = await createSignedBundle({
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
      });

      req.body = bundle;
      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          signed: true,
        })
      );
    });

    test('should reject bundle with invalid signature', async () => {
      const bundle = {
        version: '1.0',
        package: 'com.example.invalid-sig',
        appVersion: '1.0.0',
        metadata: { name: 'Invalid Signature' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
        signature: {
          alg: 'ed25519',
          pubkey: 'ed25519:invalid',
          sig: 'base64:invalid',
          signedAt: new Date().toISOString(),
        },
      };

      req.body = bundle;
      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_signature',
        })
      );
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

      req.body = bundle;
      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          signed: false,
        })
      );
    });
  });

  describe('Step 4: Bundle Retrieval', () => {
    test('should retrieve uploaded bundle', async () => {
      const namespace = 'com.example.retrieve';
      const version = '1.0.0';

      // First, upload a bundle
      const bundle = await createSignedBundle({
        version: '1.0',
        package: namespace,
        appVersion: version,
        metadata: {
          name: 'Retrieval Test',
          description: 'Test bundle retrieval',
        },
        links: {
          frontend: 'https://example.com/app',
        },
        wasm: { path: 'app.wasm', size: 1024, hash: null },
        migrations: [],
      });

      req.body = bundle;
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);

      // Now retrieve it
      const getReq = {
        method: 'GET',
        query: {
          package: namespace,
          version,
        },
      };

      const getRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getHandler(getReq, getRes);

      expect(getRes.status).toHaveBeenCalledWith(200);
      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          package: namespace,
          appVersion: version,
          metadata: expect.objectContaining({
            name: 'Retrieval Test',
          }),
        })
      );
    });
  });

  describe('Complete E2E Flow via API', () => {
    test('should complete full flow: register → claim → upload → retrieve', async () => {
      const developerPubkey = `ed25519:${Buffer.from(developerPublicKey).toString('base64')}`;
      const namespace = 'com.example.complete-flow';
      const version = '1.0.0';

      // Step 1: Developer registration (placeholder)
      const developer = {
        pubkey: developerPubkey,
        display_name: 'Complete Flow Developer',
        status: 'approved',
      };
      expect(developer.status).toBe('approved');

      // Step 2: Upload bundle (claims namespace)
      const bundle = await createSignedBundle({
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
      });

      req.body = bundle;
      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const pushResponse = res.json.mock.calls[0][0];
      expect(pushResponse.success).toBe(true);
      expect(pushResponse.package).toBe(namespace);
      expect(pushResponse.signed).toBe(true);

      // Step 3: Retrieve bundle
      const getReq = {
        method: 'GET',
        query: {
          package: namespace,
          version,
        },
      };

      const getRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getHandler(getReq, getRes);

      expect(getRes.status).toHaveBeenCalledWith(200);
      const retrieved = getRes.json.mock.calls[0][0];
      expect(retrieved.package).toBe(namespace);
      expect(retrieved.appVersion).toBe(version);
      expect(retrieved.metadata.name).toBe('Complete Flow App');
      expect(retrieved.interfaces.exports).toContain('com.example.complete.v1');
      expect(retrieved.signature).toBeDefined();
      expect(retrieved.signature.pubkey).toBe(developerPubkey);

      // Step 4: Verify namespace is claimed (cannot upload duplicate)
      const duplicateBundle = await createSignedBundle({
        version: '1.0',
        package: namespace,
        appVersion: version, // Same version
        metadata: { name: 'Duplicate' },
        wasm: { path: 'app.wasm', size: 100, hash: null },
        migrations: [],
      });

      req.body = duplicateBundle;
      res.status.mockClear();
      res.json.mockClear();
      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'bundle_exists',
        })
      );
    });
  });
});
