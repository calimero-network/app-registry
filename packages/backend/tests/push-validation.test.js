/**
 * Push Endpoint Validation Tests
 */

// Mock the kv module
const mockKv = {
  get: jest.fn(),
  set: jest.fn(),
  setNX: jest.fn(),
  sAdd: jest.fn(),
  sMembers: jest.fn(),
};

jest.mock('../../../packages/backend/src/lib/kv-client', () => ({
  kv: mockKv,
}));

// Mock verify so push accepts when we pass a fake signature (we only test body shape + flow here)
jest.mock('../../../packages/backend/src/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  normalizeSignature: jest.fn((sig) => sig || null),
}));

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
          message: 'Missing body',
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
          message: 'Missing body',
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
        signature: {
          algorithm: 'ed25519',
          publicKey: 'dGVzdC1wdWJrZXk',
          signature: 'dGVzdC1zaWduYXR1cmU',
        },
      };

      mockKv.get.mockResolvedValue(null);
      mockKv.setNX.mockResolvedValue(true);
      mockKv.sAdd.mockResolvedValue(1);
      mockKv.sMembers.mockResolvedValue([]); // no existing versions

      await pushHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockKv.setNX).toHaveBeenCalled();
    });
  });

  describe('Method Validation', () => {
    test('should reject non-POST methods', async () => {
      req.method = 'GET';
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });
});
