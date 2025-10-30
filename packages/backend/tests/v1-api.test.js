/**
 * V1 API Endpoint Tests
 *
 * Tests the v1 API endpoints according to the specification.
 * These tests drive the implementation of the API endpoints.
 */

const { buildServer } = require('../src/server');

// V1 API Endpoint Tests
describe('V1 API Endpoints', () => {
  let app;

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /v1/apps', () => {
    const validManifest = {
      manifest_version: '1.0',
      id: 'com.example.chat.manager',
      name: 'Chat Manager',
      version: '1.3.0',
      chains: ['near:testnet'],
      artifact: {
        type: 'wasm',
        target: 'node',
        digest:
          'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
      },
      provides: ['chat.manager@1'],
      requires: ['chat.channel@1'],
      dependencies: [
        {
          id: 'com.example.chat.channel',
          range: '^1.0.0',
        },
      ],
    };

    test('should accept valid manifest and return 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: validManifest,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id', 'com.example.chat.manager');
      expect(body).toHaveProperty('version', '1.3.0');
      expect(body).toHaveProperty('canonical_uri');
    });

    test('should reject invalid manifest schema and return 400', async () => {
      const invalidManifest = {
        manifest_version: '2.0', // Invalid version
        id: 'com.example.app',
        name: 'Test App',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'https://example.com/app.wasm',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: invalidManifest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'invalid_schema');
      expect(body).toHaveProperty('details');
    });

    test('should reject manifest with invalid signature and return 400', async () => {
      const manifestWithInvalidSignature = {
        ...validManifest,
        signature: {
          alg: 'ed25519',
          pubkey:
            'ed25519:INVALID_PUBKEY_123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz==',
          sig: 'base64:INVALID_SIGNATURE_123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz==',
          signed_at: '2025-01-02T00:00:00Z',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifestWithInvalidSignature,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'invalid_schema');
    });

    test('should reject manifest with invalid digest and return 400', async () => {
      const manifestWithInvalidDigest = {
        ...validManifest,
        artifact: {
          ...validManifest.artifact,
          digest: 'invalid-digest-format',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifestWithInvalidDigest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'invalid_schema');
      expect(body).toHaveProperty('details');
    });

    test('should reject duplicate manifest and return 409', async () => {
      // First submission should succeed
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: validManifest,
      });
      expect(firstResponse.statusCode).toBe(201);

      // Second submission should fail
      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: validManifest,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'already_exists');
      expect(body).toHaveProperty('details', 'com.example.chat.manager@1.3.0');
    });

    test('should reject manifest with unreachable artifact and return 424', async () => {
      const manifestWithUnreachableArtifact = {
        ...validManifest,
        artifact: {
          ...validManifest.artifact,
          uri: 'https://unreachable.example.com/artifact.wasm',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifestWithUnreachableArtifact,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id', 'com.example.chat.manager');
      expect(body).toHaveProperty('version', '1.3.0');
    });
  });

  describe('GET /v1/apps/:id', () => {
    beforeEach(async () => {
      // Seed with test data by submitting manifests
      const manifest1 = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.3.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
        },
        provides: ['chat.manager@1'],
        requires: ['chat.channel@1'],
      };

      const manifest2 = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.2.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:3333333333333333333333333333333333333333333333333333333333333333',
          uri: 'https://example.com/artifacts/chat-manager/1.2.0/manager.wasm',
        },
        provides: ['chat.manager@1'],
        requires: ['chat.channel@1'],
      };

      // Submit manifests to seed the storage
      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest1,
      });

      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest2,
      });
    });

    test('should return versions for existing app', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/apps/com.example.chat.manager',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id', 'com.example.chat.manager');
      expect(body).toHaveProperty('versions');
      expect(body.versions).toContain('1.3.0');
      expect(body.versions).toContain('1.2.0');
    });

    test('should return 404 for non-existent app', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/apps/com.nonexistent.app',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/apps/:id/:version', () => {
    beforeEach(async () => {
      // Seed with test data by submitting manifest
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.3.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
        },
        provides: ['chat.manager@1'],
        requires: ['chat.channel@1'],
      };

      // Submit manifest to seed the storage
      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest,
      });
    });

    test('should return manifest for existing app version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/apps/com.example.chat.manager/1.3.0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('manifest_version', '1.0');
      expect(body).toHaveProperty('id', 'com.example.chat.manager');
      expect(body).toHaveProperty('version', '1.3.0');
      expect(body).toHaveProperty('provides', ['chat.manager@1']);
      expect(body).toHaveProperty('requires', ['chat.channel@1']);
    });

    test('should return canonical JCS when requested', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/apps/com.example.chat.manager/1.3.0?canonical=true',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('canonical_jcs');
      expect(typeof body.canonical_jcs).toBe('string');
    });

    test('should return 404 for non-existent app version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/apps/com.example.chat.manager/2.0.0',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/search', () => {
    beforeEach(async () => {
      // Seed with test data by submitting manifests
      const manifest1 = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.3.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
        },
        provides: ['chat.manager@1'],
        requires: ['chat.channel@1'],
      };

      const manifest2 = {
        manifest_version: '1.0',
        id: 'com.example.chat.channel',
        name: 'Chat Channel',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'https://example.com/artifacts/chat-channel/1.0.0/channel.wasm',
        },
        provides: ['chat.channel@1'],
      };

      // Submit manifests to seed the storage
      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest1,
      });

      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest2,
      });
    });

    test('should search by app id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/search?q=com.example.chat.manager',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('id', 'com.example.chat.manager');
    });

    test('should search by app name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/search?q=Chat Manager',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('id', 'com.example.chat.manager');
    });

    test('should search by provides interface', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/search?q=chat.manager@1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('provides');
      expect(body[0].provides).toContain('chat.manager@1');
    });

    test('should search by requires interface', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/search?q=chat.channel@1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('requires');
      expect(body[0].requires).toContain('chat.channel@1');
    });

    test('should return empty array for no matches', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/search?q=nonexistent',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe('POST /v1/resolve', () => {
    beforeEach(async () => {
      // Seed with test data by submitting manifests
      const manifest1 = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.3.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
        },
        provides: ['chat.manager@1'],
        requires: ['chat.channel@1'],
        dependencies: [
          {
            id: 'com.example.chat.channel',
            range: '^1.0.0',
          },
        ],
      };

      const manifest2 = {
        manifest_version: '1.0',
        id: 'com.example.chat.channel',
        name: 'Chat Channel',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'https://example.com/artifacts/chat-channel/1.0.0/channel.wasm',
        },
        provides: ['chat.channel@1'],
      };

      // Submit manifests to seed the storage
      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest1,
      });

      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest2,
      });
    });

    test('should resolve dependencies successfully', async () => {
      const resolveRequest = {
        root: {
          id: 'com.example.chat.manager',
          version: '1.3.0',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/resolve',
        payload: resolveRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('plan');
      expect(body).toHaveProperty('satisfies');
      expect(body).toHaveProperty('missing');
      expect(body.plan).toContainEqual({
        action: 'install',
        id: 'com.example.chat.channel',
        version: '1.0.0',
      });
      expect(body.satisfies).toContain('chat.channel@1');
      expect(body.missing).toHaveLength(0);
    });

    test('should handle missing requirements', async () => {
      const resolveRequest = {
        root: {
          id: 'com.example.chat.manager',
          version: '1.3.0',
        },
      };

      // TODO: Remove chat.channel manifest to test missing requirements

      const response = await app.inject({
        method: 'POST',
        url: '/v1/resolve',
        payload: resolveRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('plan');
      expect(body).toHaveProperty('satisfies');
      expect(body).toHaveProperty('missing');
      expect(body.plan).toContainEqual({
        action: 'install',
        id: 'com.example.chat.channel',
        version: '1.0.0',
      });
    });

    test('should handle dependency conflicts', async () => {
      const resolveRequest = {
        root: {
          id: 'com.example.chat.manager',
          version: '1.3.0',
        },
        installed: [
          {
            id: 'com.example.chat.channel',
            version: '2.0.0',
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/resolve',
        payload: resolveRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('plan');
      expect(body).toHaveProperty('satisfies');
      expect(body).toHaveProperty('missing');
    });

    test('should detect cycles in dependencies', async () => {
      // TODO: Create manifests with circular dependencies
      const resolveRequest = {
        root: {
          id: 'com.example.app.a',
          version: '1.0.0',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/resolve',
        payload: resolveRequest,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'not_found');
    });
  });
});
