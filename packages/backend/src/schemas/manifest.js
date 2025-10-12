const manifestSchema = {
  type: 'object',
  required: ['manifest_version', 'app', 'version', 'artifacts', 'distribution'],
  properties: {
    manifest_version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+$',
    },
    app: {
      type: 'object',
      required: ['name', 'namespace', 'developer_pubkey'],
      properties: {
        name: {
          type: 'string',
          pattern: '^[a-z0-9._-]{1,64}$',
        },
        namespace: {
          type: 'string',
          pattern: '^[a-z0-9.-]{1,128}$',
        },
        developer_pubkey: {
          type: 'string',
          minLength: 1,
        },
        id: {
          type: 'string',
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
        properties: {
          type: { type: 'string', enum: ['wasm'] },
          target: { type: 'string' },
          path: {
            type: 'string',
            pattern: '^/.*',
          },
          cid: {
            type: 'string',
            pattern: '^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^bafy[a-z2-7]{55}$',
          },
          mirrors: {
            type: 'array',
            items: { type: 'string', format: 'uri', pattern: '^https://.*' },
            minItems: 1,
          },
          size: { type: 'integer', minimum: 1 },
          sha256: {
            anyOf: [
              { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' },
              { type: 'string', pattern: '^[1-9A-HJ-NP-Za-km-z]{43,52}$' },
            ],
          },
        },
        required: ['type', 'target', 'size'],
        oneOf: [
          { required: ['path'] },
          { required: ['cid'] },
          { required: ['mirrors'] },
        ],
      },
      minItems: 1,
    },
    metadata: {
      type: 'object',
    },
    distribution: {
      type: 'string',
    },
    signature: {
      type: 'object',
      required: ['alg', 'sig', 'signed_at'],
      properties: {
        alg: { type: 'string', enum: ['Ed25519', 'ed25519'] },
        sig: { type: 'string' },
        signed_at: { type: 'string', format: 'date-time' },
      },
    },
  },
};

module.exports = manifestSchema;
