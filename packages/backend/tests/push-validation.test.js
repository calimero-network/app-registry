/**
 * Push Endpoint Validation Tests
 *
 * Tests request body validation and error handling
 */

// Mock the storage and verification modules
const mockStore = {
  getBundleManifest: jest.fn(),
  storeBundleManifest: jest.fn(),
};

jest.mock('../../../packages/backend/src/lib/bundle-storage-kv', () => ({
  BundleStorageKV: jest.fn(() => mockStore),
}));

// Mock verify module
const mockVerify = {
  verifyBundleSignature: jest.fn(),
};

jest.mock('../../../packages/backend/src/lib/verify', () => mockVerify);

// Import the handler
const pushHandler = require('../../../api/v2/bundles/push');

describe('Push Endpoint Validation', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      method: 'POST',
      body: null,
      headers: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
  });

  describe('Request Body Validation', () => {
    test('should reject null body', async () => {
      req.body = null;

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_manifest',
          message: 'Bundle manifest validation failed',
        })
      );
    });

    test('should reject undefined body', async () => {
      req.body = undefined;

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_manifest',
          message: 'Bundle manifest validation failed',
        })
      );
    });

    test('should reject array body', async () => {
      req.body = [
        { package: 'com.example.test', appVersion: '1.0.0' },
        { package: 'com.example.test2', appVersion: '1.0.0' },
      ];

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_manifest',
          message: 'Bundle manifest validation failed',
        })
      );
    });

    test('should reject empty array', async () => {
      req.body = [];

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_manifest',
          message: 'Bundle manifest validation failed',
        })
      );
    });

    test('should accept valid object body', async () => {
      req.body = {
        version: '1.0',
        package: 'com.example.test',
        appVersion: '1.0.0',
        metadata: {
          name: 'Test App',
          description: 'A test app',
          author: 'Test Author',
        },
        wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
        migrations: [],
      };

      mockStore.getBundleManifest.mockResolvedValue(null);
      mockVerify.verifyBundleSignature.mockResolvedValue({ valid: true });
      mockStore.storeBundleManifest.mockResolvedValue();

      await pushHandler(req, res);

      // Should proceed past body validation (may fail later, but not on body type)
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(mockStore.storeBundleManifest).toHaveBeenCalled();
    });

    test('should reject primitive types', async () => {
      req.body = 'string';

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject number', async () => {
      req.body = 123;

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject boolean', async () => {
      req.body = true;

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Method Validation', () => {
    test('should reject non-POST methods', async () => {
      req.method = 'GET';
      req.body = { package: 'com.example.test', appVersion: '1.0.0' };

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Method not allowed',
      });
    });
  });
});
