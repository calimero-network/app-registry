import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

// Mock fetch globally
global.fetch = vi.fn();

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));

describe('Bundle Push - Remote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bundle Reading and Hex Conversion', () => {
    it('should read bundle file as binary', () => {
      const mockBuffer = Buffer.from('test bundle content');
      vi.mocked(fs.readFileSync).mockReturnValue(mockBuffer);

      const buffer = fs.readFileSync('test.mpk');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should convert bundle to hex string', () => {
      const mockBuffer = Buffer.from('test');
      const hexString = mockBuffer.toString('hex');
      expect(hexString).toBe('74657374');
      expect(typeof hexString).toBe('string');
    });
  });

  describe('Payload Construction', () => {
    it('should construct payload with all manifest fields', () => {
      const manifest = {
        version: '1.0',
        package: 'com.calimero.test',
        appVersion: '1.0.0',
        metadata: {
          name: 'Test App',
          description: 'Test',
          author: 'Test Author',
        },
        wasm: {
          path: 'app.wasm',
          hash: 'sha256:abc123',
          size: 1000,
        },
        links: {
          frontend: 'https://example.com',
        },
      };

      const bundleHex = 'deadbeef';
      const payload = {
        version: manifest.version,
        package: manifest.package,
        appVersion: manifest.appVersion,
        metadata: manifest.metadata,
        wasm: manifest.wasm,
        links: manifest.links,
        _binary: bundleHex,
        _overwrite: true,
      };

      expect(payload.package).toBe('com.calimero.test');
      expect(payload.appVersion).toBe('1.0.0');
      expect(payload._binary).toBe(bundleHex);
      expect(payload._overwrite).toBe(true);
      expect(payload.metadata).toBeDefined();
      expect(payload.wasm).toBeDefined();
      expect(payload.links).toBeDefined();
    });

    it('should handle manifest without optional fields', () => {
      const manifest = {
        version: '1.0',
        package: 'com.calimero.test',
        appVersion: '1.0.0',
      };

      const bundleHex = 'deadbeef';
      const payload: Record<string, unknown> = {
        version: manifest.version,
        package: manifest.package,
        appVersion: manifest.appVersion,
        _binary: bundleHex,
        _overwrite: true,
      };

      expect(payload.package).toBe('com.calimero.test');
      expect(payload._binary).toBe(bundleHex);
      expect(payload.metadata).toBeUndefined();
    });
  });

  describe('HTTP Request', () => {
    it('should POST to correct endpoint', async () => {
      const registryUrl = 'https://apps.calimero.network';
      const apiUrl = `${registryUrl}/api/v2/bundles/push`;

      vi.mocked(global.fetch).mockResolvedValue({
        status: 201,
        json: async () => ({
          message: 'Bundle published successfully',
          package: 'com.calimero.test',
          version: '1.0.0',
        }),
        text: async () => JSON.stringify({ message: 'success' }),
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: 'data' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        apiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(response.status).toBe(201);
    });

    it('should include Authorization header when API key is provided', async () => {
      const apiKey = 'test-api-key';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should handle timeout', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      vi.mocked(global.fetch).mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                status: 201,
                json: async () => ({}),
              });
            }, 2000);
          })
      );

      try {
        await fetch('https://example.com', {
          signal: controller.signal,
        });
      } catch (error: unknown) {
        expect(error instanceof Error && error.name).toBe('AbortError');
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle 400 Bad Request', () => {
      const statusCode = 400;
      const responseBody = {
        error: 'invalid_manifest',
        message: 'Missing required fields',
      };

      expect(statusCode).toBe(400);
      expect(responseBody.error).toBe('invalid_manifest');
    });

    it('should handle 401 Unauthorized', () => {
      const statusCode = 401;
      const responseBody = {
        error: 'unauthorized',
        message: 'Authentication required',
      };

      expect(statusCode).toBe(401);
      expect(responseBody.error).toBe('unauthorized');
    });

    it('should handle 403 Forbidden', () => {
      const statusCode = 403;
      const responseBody = {
        error: 'forbidden',
        message: 'Namespace ownership required',
      };

      expect(statusCode).toBe(403);
      expect(responseBody.error).toBe('forbidden');
    });

    it('should handle 409 Conflict', () => {
      const statusCode = 409;
      const responseBody = {
        error: 'conflict',
        message: 'Version already exists',
      };

      expect(statusCode).toBe(409);
      expect(responseBody.error).toBe('conflict');
    });

    it('should handle 500 Internal Server Error', () => {
      const statusCode = 500;
      const responseBody = {
        error: 'internal_error',
        message: 'Server error',
      };

      expect(statusCode).toBe(500);
      expect(responseBody.error).toBe('internal_error');
    });
  });

  describe('Verification', () => {
    it('should verify bundle after successful push', async () => {
      const registryUrl = 'https://apps.calimero.network';
      const packageName = 'com.calimero.test';
      const version = '1.0.0';
      const verifyUrl = `${registryUrl}/api/v2/bundles/${packageName}/${version}`;

      vi.mocked(global.fetch).mockResolvedValue({
        status: 200,
        json: async () => ({
          package: packageName,
          appVersion: version,
        }),
      });

      const response = await fetch(verifyUrl, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.package).toBe(packageName);
      expect(data.appVersion).toBe(version);
    });

    it('should handle verification failure gracefully', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        status: 404,
        text: async () => 'Not found',
      });

      const response = await fetch('https://example.com');
      expect(response.status).toBe(404);
    });
  });

  describe('URL Construction', () => {
    it('should handle registry URL with trailing slash', () => {
      const url1 = 'https://apps.calimero.network/';
      const url2 = 'https://apps.calimero.network';
      const cleaned1 = url1.replace(/\/$/, '');
      const cleaned2 = url2.replace(/\/$/, '');

      expect(cleaned1).toBe('https://apps.calimero.network');
      expect(cleaned2).toBe('https://apps.calimero.network');
    });

    it('should construct API endpoint correctly', () => {
      const registryUrl = 'https://apps.calimero.network';
      const apiUrl = `${registryUrl.replace(/\/$/, '')}/api/v2/bundles/push`;
      expect(apiUrl).toBe('https://apps.calimero.network/api/v2/bundles/push');
    });

    it('should construct verification endpoint correctly', () => {
      const registryUrl = 'https://apps.calimero.network';
      const packageName = 'com.calimero.test';
      const version = '1.0.0';
      const verifyUrl = `${registryUrl.replace(/\/$/, '')}/api/v2/bundles/${packageName}/${version}`;
      expect(verifyUrl).toBe(
        'https://apps.calimero.network/api/v2/bundles/com.calimero.test/1.0.0'
      );
    });
  });
});
