const manifestSchema = {
  type: 'object',
  required: [
    'manifest_version',
    'app',
    'version',
    'supported_chains',
    'permissions',
    'artifacts',
    'metadata',
    'distribution',
    'signature',
  ],
  properties: {
    manifest_version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+$',
    },
    app: {
      type: 'object',
      required: ['name', 'developer_pubkey', 'id', 'alias'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        developer_pubkey: {
          type: 'string',
          minLength: 1,
        },
        id: {
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
        },
        alias: {
          type: 'string',
          pattern: '^[a-zA-Z0-9.-]+$',
        },
      },
    },
    version: {
      type: 'object',
      required: ['semver'],
      properties: {
        semver: {
          type: 'string',
          pattern:
            '^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z\\.-]+)?(\\+[0-9A-Za-z\\.-]+)?$',
        },
      },
    },
    supported_chains: {
      type: 'array',
      items: {
        type: 'string',
      },
      minItems: 1,
    },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cap', 'bytes'],
        properties: {
          cap: {
            type: 'string',
          },
          bytes: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'target', 'cid', 'size'],
        properties: {
          type: {
            type: 'string',
            enum: ['wasm'],
          },
          target: {
            type: 'string',
          },
          cid: {
            type: 'string',
            pattern: '^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^bafy[a-z2-7]{55}$',
          },
          size: {
            type: 'integer',
            minimum: 1,
          },
          mirrors: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uri',
            },
          },
        },
      },
      minItems: 1,
    },
    metadata: {
      type: 'object',
    },
    distribution: {
      type: 'string',
      enum: ['ipfs'],
    },
    signature: {
      type: 'object',
      required: ['alg', 'sig', 'signed_at'],
      properties: {
        alg: {
          type: 'string',
          enum: ['Ed25519'],
        },
        sig: {
          type: 'string',
        },
        signed_at: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
  },
};

module.exports = manifestSchema;
