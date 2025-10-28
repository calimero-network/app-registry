/**
 * V1 API Endpoint Tests
 *
 * Tests the v1 API endpoints according to the specification.
 * These tests drive the implementation of the API endpoints.
 */

const request = require('supertest');
const { buildServer } = require('../src/server');

// Skip API tests for now due to supertest compatibility issues
describe.skip('V1 API Endpoints', () => {
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
      signature: {
        alg: 'ed25519',
        pubkey: 'ed25519:MANAGER_PUBKEY_EXAMPLE',
        sig: 'base64:MANAGER_SIGNATURE_EXAMPLE',
        signed_at: '2025-01-02T00:00:00Z',
      },
    };

    test('should accept valid manifest and return 201', async () => {
      const response = await request(app)
        .post('/v1/apps')
        .send(validManifest)
        .expect(201);

      expect(response.body).toHaveProperty('id', 'com.example.chat.manager');
      expect(response.body).toHaveProperty('version', '1.3.0');
      expect(response.body).toHaveProperty('canonical_uri');
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

      const response = await request(app)
        .post('/v1/apps')
        .send(invalidManifest)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'invalid_schema');
      expect(response.body).toHaveProperty('details');
    });

    test('should reject manifest with invalid signature and return 400', async () => {
      const manifestWithInvalidSignature = {
        ...validManifest,
        signature: {
          alg: 'ed25519',
          pubkey: 'ed25519:INVALID_PUBKEY',
          sig: 'base64:INVALID_SIGNATURE',
          signed_at: '2025-01-02T00:00:00Z',
        },
      };

      const response = await request(app)
        .post('/v1/apps')
        .send(manifestWithInvalidSignature)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'invalid_signature');
      expect(response.body).toHaveProperty('details');
    });

    test('should reject manifest with invalid digest and return 400', async () => {
      const manifestWithInvalidDigest = {
        ...validManifest,
        artifact: {
          ...validManifest.artifact,
          digest: 'invalid-digest',
        },
      };

      const response = await request(app)
        .post('/v1/apps')
        .send(manifestWithInvalidDigest)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'invalid_digest');
      expect(response.body).toHaveProperty('details');
    });

    test('should reject duplicate manifest and return 409', async () => {
      // First submission should succeed
      await request(app).post('/v1/apps').send(validManifest).expect(201);

      // Second submission should fail
      const response = await request(app)
        .post('/v1/apps')
        .send(validManifest)
        .expect(409);

      expect(response.body).toHaveProperty('error', 'already_exists');
      expect(response.body).toHaveProperty(
        'details',
        'com.example.chat.manager@1.3.0'
      );
    });

    test('should reject manifest with unreachable artifact and return 424', async () => {
      const manifestWithUnreachableArtifact = {
        ...validManifest,
        artifact: {
          ...validManifest.artifact,
          uri: 'https://unreachable.example.com/artifact.wasm',
        },
      };

      const response = await request(app)
        .post('/v1/apps')
        .send(manifestWithUnreachableArtifact)
        .expect(424);

      expect(response.body).toHaveProperty('error', 'artifact_unreachable');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('GET /v1/apps/:id', () => {
    beforeEach(async () => {
      // Seed with test data
      // const manifest1 = {
      //   manifest_version: '1.0',
      //   id: 'com.example.chat.manager',
      //   name: 'Chat Manager',
      //   version: '1.3.0',
      //   chains: ['near:testnet'],
      //   artifact: {
      //     type: 'wasm',
      //     target: 'node',
      //     digest:
      //       'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      //     uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
      //   },
      // };
      // const manifest2 = {
      //   manifest_version: '1.0',
      //   id: 'com.example.chat.manager',
      //   name: 'Chat Manager',
      //   version: '1.2.0',
      //   chains: ['near:testnet'],
      //   artifact: {
      //     type: 'wasm',
      //     target: 'node',
      //     digest:
      //       'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      //     uri: 'https://example.com/artifacts/chat-manager/1.2.0/manager.wasm',
      //   },
      // };
      // storage.storeManifest(manifest1);
      // storage.storeManifest(manifest2);
    });

    test('should return versions for existing app', async () => {
      const response = await request(app)
        .get('/v1/apps/com.example.chat.manager')
        .expect(200);

      expect(response.body).toHaveProperty('id', 'com.example.chat.manager');
      expect(response.body).toHaveProperty('versions');
      expect(response.body.versions).toContain('1.3.0');
      expect(response.body.versions).toContain('1.2.0');
    });

    test('should return 404 for non-existent app', async () => {
      await request(app).get('/v1/apps/com.nonexistent.app').expect(404);
    });
  });

  describe('GET /v1/apps/:id/:version', () => {
    beforeEach(async () => {
      // Seed with test data
      // const manifest = {
      //   manifest_version: '1.0',
      //   id: 'com.example.chat.manager',
      //   name: 'Chat Manager',
      //   version: '1.3.0',
      //   chains: ['near:testnet'],
      //   artifact: {
      //     type: 'wasm',
      //     target: 'node',
      //     digest:
      //       'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      //     uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
      //   },
      //   provides: ['chat.manager@1'],
      //   requires: ['chat.channel@1'],
      // };
      // TODO: Add manifest to storage when implemented
    });

    test('should return manifest for existing app version', async () => {
      const response = await request(app)
        .get('/v1/apps/com.example.chat.manager/1.3.0')
        .expect(200);

      expect(response.body).toHaveProperty('manifest_version', '1.0');
      expect(response.body).toHaveProperty('id', 'com.example.chat.manager');
      expect(response.body).toHaveProperty('version', '1.3.0');
      expect(response.body).toHaveProperty('provides', ['chat.manager@1']);
      expect(response.body).toHaveProperty('requires', ['chat.channel@1']);
    });

    test('should return canonical JCS when requested', async () => {
      const response = await request(app)
        .get('/v1/apps/com.example.chat.manager/1.3.0?canonical=true')
        .expect(200);

      expect(response.body).toHaveProperty('canonical_jcs');
      expect(typeof response.body.canonical_jcs).toBe('string');
    });

    test('should return 404 for non-existent app version', async () => {
      await request(app)
        .get('/v1/apps/com.example.chat.manager/2.0.0')
        .expect(404);
    });
  });

  describe('GET /v1/search', () => {
    beforeEach(async () => {
      // Seed with test data
      // const manifests = [
      //   {
      //     manifest_version: '1.0',
      //     id: 'com.example.chat.manager',
      //     name: 'Chat Manager',
      //     version: '1.3.0',
      //     chains: ['near:testnet'],
      //     artifact: {
      //       type: 'wasm',
      //       target: 'node',
      //       digest:
      //         'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      //       uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
      //     },
      //     provides: ['chat.manager@1'],
      //     requires: ['chat.channel@1'],
      //   },
      //   {
      //     manifest_version: '1.0',
      //     id: 'com.example.chat.channel',
      //     name: 'Chat Channel',
      //     version: '1.0.0',
      //     chains: ['near:testnet'],
      //     artifact: {
      //       type: 'wasm',
      //       target: 'node',
      //       digest:
      //         'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      //       uri: 'https://example.com/artifacts/chat-channel/1.0.0/channel.wasm',
      //     },
      //     provides: ['chat.channel@1'],
      //   },
      // ];
      // TODO: Add manifests to storage when implemented
    });

    test('should search by app id', async () => {
      const response = await request(app)
        .get('/v1/search?q=com.example.chat.manager')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id', 'com.example.chat.manager');
    });

    test('should search by app name', async () => {
      const response = await request(app)
        .get('/v1/search?q=Chat Manager')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id', 'com.example.chat.manager');
    });

    test('should search by provides interface', async () => {
      const response = await request(app)
        .get('/v1/search?q=chat.manager@1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('provides');
      expect(response.body[0].provides).toContain('chat.manager@1');
    });

    test('should search by requires interface', async () => {
      const response = await request(app)
        .get('/v1/search?q=chat.channel@1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('requires');
      expect(response.body[0].requires).toContain('chat.channel@1');
    });

    test('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/v1/search?q=nonexistent')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('POST /v1/resolve', () => {
    beforeEach(async () => {
      // Seed with test data
      // const manifests = [
      //   {
      //     manifest_version: '1.0',
      //     id: 'com.example.chat.manager',
      //     name: 'Chat Manager',
      //     version: '1.3.0',
      //     chains: ['near:testnet'],
      //     artifact: {
      //       type: 'wasm',
      //       target: 'node',
      //       digest:
      //         'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      //       uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
      //     },
      //     provides: ['chat.manager@1'],
      //     requires: ['chat.channel@1'],
      //     dependencies: [
      //       {
      //         id: 'com.example.chat.channel',
      //         range: '^1.0.0',
      //       },
      //     ],
      //   },
      //   {
      //     manifest_version: '1.0',
      //     id: 'com.example.chat.channel',
      //     name: 'Chat Channel',
      //     version: '1.0.0',
      //     chains: ['near:testnet'],
      //     artifact: {
      //       type: 'wasm',
      //       target: 'node',
      //       digest:
      //         'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      //       uri: 'https://example.com/artifacts/chat-channel/1.0.0/channel.wasm',
      //     },
      //     provides: ['chat.channel@1'],
      //   },
      // ];
      // TODO: Add manifests to storage when implemented
    });

    test('should resolve dependencies successfully', async () => {
      const resolveRequest = {
        root: {
          id: 'com.example.chat.manager',
          version: '1.3.0',
        },
      };

      const response = await request(app)
        .post('/v1/resolve')
        .send(resolveRequest)
        .expect(200);

      expect(response.body).toHaveProperty('plan');
      expect(response.body).toHaveProperty('satisfies');
      expect(response.body).toHaveProperty('missing');
      expect(response.body.plan).toContainEqual({
        action: 'install',
        id: 'com.example.chat.channel',
        version: '1.0.0',
      });
      expect(response.body.satisfies).toContain('chat.channel@1');
      expect(response.body.missing).toHaveLength(0);
    });

    test('should handle missing requirements', async () => {
      const resolveRequest = {
        root: {
          id: 'com.example.chat.manager',
          version: '1.3.0',
        },
      };

      // TODO: Remove chat.channel manifest to test missing requirements

      const response = await request(app)
        .post('/v1/resolve')
        .send(resolveRequest)
        .expect(422);

      expect(response.body).toHaveProperty('error', 'missing_requirements');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details).toContain('chat.channel@1');
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

      const response = await request(app)
        .post('/v1/resolve')
        .send(resolveRequest)
        .expect(422);

      expect(response.body).toHaveProperty('error', 'dependency_conflict');
      expect(response.body).toHaveProperty('details');
    });

    test('should detect cycles in dependencies', async () => {
      // TODO: Create manifests with circular dependencies
      const resolveRequest = {
        root: {
          id: 'com.example.app.a',
          version: '1.0.0',
        },
      };

      const response = await request(app)
        .post('/v1/resolve')
        .send(resolveRequest)
        .expect(422);

      expect(response.body).toHaveProperty('error', 'dependency_conflict');
      expect(response.body).toHaveProperty('details');
    });
  });
});
