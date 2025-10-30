/**
 * V1 API Integration Tests
 *
 * Tests the v1 API endpoints with a real server instance.
 */

const { buildServer } = require('../src/server');

// V1 API Integration Tests
describe('V1 API Integration Tests', () => {
  let app;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
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

    test('should reject duplicate manifest and return 409', async () => {
      // Create a unique manifest for this test
      const uniqueManifest = {
        ...validManifest,
        id: 'com.example.chat.manager.duplicate',
      };

      // First submission should succeed
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: uniqueManifest,
      });
      expect(firstResponse.statusCode).toBe(201);

      // Second submission should fail
      const response = await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: uniqueManifest,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'already_exists');
      expect(body).toHaveProperty('details');
    });
  });

  describe('GET /v1/apps/:id', () => {
    beforeEach(async () => {
      // Seed with test data
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

      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest,
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
      // Seed with test data
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
      // Seed with test data
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

      await app.inject({
        method: 'POST',
        url: '/v1/apps',
        payload: manifest,
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
});
