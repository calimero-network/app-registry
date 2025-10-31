/**
 * V1 API End-to-End Tests
 *
 * Tests the complete V1 API workflow including manifest submission,
 * retrieval, search, and dependency resolution.
 */

const { buildServer } = require('../src/server');
// const http = require('http');

describe('V1 API End-to-End Tests', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = await buildServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addressInfo = server.server.address();
    const port =
      typeof addressInfo === 'object' && addressInfo !== null
        ? addressInfo.port
        : Number(String(addressInfo).split(':').pop());
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Health and Basic Endpoints', () => {
    test('should return health status', async () => {
      const response = await fetch(`${baseUrl}/healthz`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('should return statistics', async () => {
      const response = await fetch(`${baseUrl}/stats`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('publishedApps');
      expect(data).toHaveProperty('message');
    });
  });

  describe('Manifest Submission and Retrieval', () => {
    const testManifest = {
      manifest_version: '1.0',
      id: 'com.test.e2e.app',
      name: 'E2E Test App',
      version: '1.0.0',
      chains: ['near:testnet'],
      artifact: {
        type: 'wasm',
        target: 'node',
        digest:
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        uri: 'https://example.com/test-app.wasm',
      },
      provides: ['storage@1'],
    };

    test('should submit a valid manifest', async () => {
      const response = await fetch(`${baseUrl}/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testManifest),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('com.test.e2e.app');
      expect(data.version).toBe('1.0.0');
      expect(data.canonical_uri).toBe('/v1/apps/com.test.e2e.app/1.0.0');
    });

    test('should retrieve app versions', async () => {
      const response = await fetch(`${baseUrl}/v1/apps/com.test.e2e.app`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('com.test.e2e.app');
      expect(data.versions).toContain('1.0.0');
    });

    test('should retrieve specific manifest', async () => {
      const response = await fetch(`${baseUrl}/v1/apps/com.test.e2e.app/1.0.0`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('com.test.e2e.app');
      expect(data.name).toBe('E2E Test App');
      expect(data.version).toBe('1.0.0');
      expect(data.chains).toEqual(['near:testnet']);
    });

    test('should return canonical JCS format', async () => {
      const response = await fetch(
        `${baseUrl}/v1/apps/com.test.e2e.app/1.0.0?canonical=true`
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('canonical_jcs');
      expect(typeof data.canonical_jcs).toBe('string');
    });
  });

  describe('Search Functionality', () => {
    test('should search by app name', async () => {
      const response = await fetch(`${baseUrl}/v1/search?q=E2E`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('version');
    });

    test('should search by app id', async () => {
      const response = await fetch(`${baseUrl}/v1/search?q=com.test.e2e.app`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    test('should return empty array for no matches', async () => {
      const response = await fetch(`${baseUrl}/v1/search?q=nonexistent`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    test('should require query parameter', async () => {
      const response = await fetch(`${baseUrl}/v1/search`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_query');
    });
  });

  describe('Dependency Resolution', () => {
    test('should resolve dependencies for existing app', async () => {
      const response = await fetch(`${baseUrl}/v1/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: { id: 'com.test.e2e.app', version: '1.0.0' },
          installed: [],
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('plan');
      expect(data).toHaveProperty('satisfies');
      expect(data).toHaveProperty('missing');
      expect(Array.isArray(data.plan)).toBe(true);
    });

    test('should handle missing root app', async () => {
      const response = await fetch(`${baseUrl}/v1/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: { id: 'com.nonexistent.app', version: '1.0.0' },
          installed: [],
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('not_found');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid manifest schema', async () => {
      const invalidManifest = {
        manifest_version: '1.0',
        // Missing required fields
        id: 'com.invalid.app',
      };

      const response = await fetch(`${baseUrl}/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidManifest),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_schema');
    });

    test('should handle duplicate manifest submission', async () => {
      const duplicateManifest = {
        manifest_version: '1.0',
        id: 'com.test.e2e.app',
        name: 'E2E Test App',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'https://example.com/duplicate.wasm',
        },
      };

      const response = await fetch(`${baseUrl}/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateManifest),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('already_exists');
    });

    test('should handle non-existent app retrieval', async () => {
      const response = await fetch(`${baseUrl}/v1/apps/com.nonexistent.app`);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('not_found');
    });

    test('should handle non-existent manifest retrieval', async () => {
      const response = await fetch(`${baseUrl}/v1/apps/com.test.e2e.app/2.0.0`);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('not_found');
    });
  });

  describe('Multiple Versions', () => {
    test('should handle multiple versions of the same app', async () => {
      // Submit version 2.0.0
      const v2Manifest = {
        manifest_version: '1.0',
        id: 'com.test.e2e.app',
        name: 'E2E Test App',
        version: '2.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:3333333333333333333333333333333333333333333333333333333333333333',
          uri: 'https://example.com/test-app-v2.wasm',
        },
      };

      const submitResponse = await fetch(`${baseUrl}/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v2Manifest),
      });
      expect(submitResponse.status).toBe(201);

      // Check that both versions are listed
      const versionsResponse = await fetch(
        `${baseUrl}/v1/apps/com.test.e2e.app`
      );
      expect(versionsResponse.status).toBe(200);
      const versionsData = await versionsResponse.json();
      expect(versionsData.versions).toContain('1.0.0');
      expect(versionsData.versions).toContain('2.0.0');
    });
  });
});
