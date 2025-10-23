/**
 * V1 Manifest Schema Tests
 *
 * Tests the v1 manifest schema validation according to the specification.
 * These tests drive the implementation of the schema validation.
 */

const { v1ManifestSchema } = require('../src/schemas/v1-manifest');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('V1 Manifest Schema Validation', () => {
  let ajv;

  beforeEach(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
  });

  describe('Valid Manifests', () => {
    test('should accept minimal valid manifest', () => {
      const manifest = {
        manifest_version: '1.0',
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

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should accept manifest with all optional fields', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.chat.manager',
        name: 'Chat Manager',
        version: '1.3.0',
        chains: ['near:testnet', 'near:mainnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          uri: 'ipfs://QmExampleHash',
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
          pubkey: 'ed25519:examplepubkey',
          sig: 'base64:examplesignature',
          signed_at: '2025-01-01T00:00:00Z',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should accept manifest with _warnings field', () => {
      const manifest = {
        manifest_version: '1.0',
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
        _warnings: ['This is a test warning'],
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });
  });

  describe('Invalid Manifests', () => {
    test('should reject manifest with wrong manifest_version', () => {
      const manifest = {
        manifest_version: '2.0',
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

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe('must be equal to constant');
    });

    test('should reject manifest with invalid id format', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'Invalid_ID_Format',
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

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must match pattern "^[a-z0-9]+(\\.[a-z0-9-]+)+$"'
      );
    });

    test('should reject manifest with invalid artifact digest', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.app',
        name: 'Test App',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest: 'invalid-digest',
          uri: 'https://example.com/app.wasm',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must match pattern "^sha256:[0-9a-f]{64}$"'
      );
    });

    test('should reject manifest with invalid artifact URI', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.app',
        name: 'Test App',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'ftp://example.com/app.wasm',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must match pattern "^(https://|ipfs://)"'
      );
    });

    test('should reject manifest with invalid version format', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.app',
        name: 'Test App',
        version: 'invalid-version',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'https://example.com/app.wasm',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must match pattern "^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z\\.-]+)?(\\+[0-9A-Za-z\\.-]+)?$"'
      );
    });

    test('should reject manifest with invalid provides format', () => {
      const manifest = {
        manifest_version: '1.0',
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
        provides: ['invalid-interface-format'],
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must match pattern "^[a-z0-9.]+@[0-9]+$"'
      );
    });

    test('should reject manifest with invalid signature format', () => {
      const manifest = {
        manifest_version: '1.0',
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
        signature: {
          alg: 'rsa',
          pubkey: 'invalid-pubkey',
          sig: 'invalid-signature',
          signed_at: 'invalid-date',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors.length).toBeGreaterThan(0);
    });

    test('should reject manifest with unknown fields', () => {
      const manifest = {
        manifest_version: '1.0',
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
        unknown_field: 'should be rejected',
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must NOT have additional properties'
      );
    });

    test('should reject manifest with too many dependencies', () => {
      const manifest = {
        manifest_version: '1.0',
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
        dependencies: Array(33)
          .fill()
          .map((_, i) => ({
            id: `com.example.dep${i}`,
            range: '^1.0.0',
          })),
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(false);
      expect(validate.errors).toHaveLength(1);
      expect(validate.errors[0].message).toBe(
        'must NOT have more than 32 items'
      );
    });
  });

  describe('Edge Cases', () => {
    test('should accept manifest with empty provides array', () => {
      const manifest = {
        manifest_version: '1.0',
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
        provides: [],
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should accept manifest with complex version', () => {
      const manifest = {
        manifest_version: '1.0',
        id: 'com.example.app',
        name: 'Test App',
        version: '1.2.3-beta.1+build.123',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest:
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          uri: 'https://example.com/app.wasm',
        },
      };

      const validate = ajv.compile(v1ManifestSchema);
      const valid = validate(manifest);

      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });
  });
});
