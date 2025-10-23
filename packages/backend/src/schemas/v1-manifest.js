/**
 * V1 Manifest Schema for Calimero SSApp Registry
 *
 * This schema enforces the minimal v1 specification with strict validation.
 * Only the defined fields are allowed; unknown fields are rejected.
 */

const v1ManifestSchema = {
  type: 'object',
  required: ['manifest_version', 'id', 'name', 'version', 'chains', 'artifact'],
  properties: {
    manifest_version: {
      type: 'string',
      const: '1.0',
    },
    id: {
      type: 'string',
      pattern: '^[a-z0-9]+(\\.[a-z0-9-]+)+$',
      minLength: 1,
      maxLength: 128,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    version: {
      type: 'string',
      pattern:
        '^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z\\.-]+)?(\\+[0-9A-Za-z\\.-]+)?$',
      minLength: 1,
      maxLength: 32,
    },
    chains: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
      },
      minItems: 1,
      maxItems: 16,
    },
    artifact: {
      type: 'object',
      required: ['type', 'target', 'digest', 'uri'],
      properties: {
        type: {
          type: 'string',
          const: 'wasm',
        },
        target: {
          type: 'string',
          const: 'node',
        },
        digest: {
          type: 'string',
          pattern: '^sha256:[0-9a-f]{64}$',
        },
        uri: {
          type: 'string',
          pattern: '^(https://|ipfs://)',
          minLength: 1,
          maxLength: 512,
        },
      },
      additionalProperties: false,
    },
    provides: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-z0-9.]+@[0-9]+$',
        minLength: 1,
        maxLength: 64,
      },
      maxItems: 16,
    },
    requires: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-z0-9.]+@[0-9]+$',
        minLength: 1,
        maxLength: 64,
      },
      maxItems: 16,
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'range'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-z0-9]+(\\.[a-z0-9-]+)+$',
            minLength: 1,
            maxLength: 128,
          },
          range: {
            type: 'string',
            minLength: 1,
            maxLength: 32,
          },
        },
        additionalProperties: false,
      },
      maxItems: 32,
    },
    signature: {
      type: 'object',
      required: ['alg', 'pubkey', 'sig', 'signed_at'],
      properties: {
        alg: {
          type: 'string',
          const: 'ed25519',
        },
        pubkey: {
          type: 'string',
          pattern: '^ed25519:[A-Za-z0-9+/=]+$',
          minLength: 1,
          maxLength: 128,
        },
        sig: {
          type: 'string',
          pattern: '^base64:[A-Za-z0-9+/=]+$',
          minLength: 1,
          maxLength: 256,
        },
        signed_at: {
          type: 'string',
          pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$',
        },
      },
      additionalProperties: false,
    },
    _warnings: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 256,
      },
      maxItems: 16,
    },
  },
  additionalProperties: false,
};

module.exports = {
  v1ManifestSchema,
};
