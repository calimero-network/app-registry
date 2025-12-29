const {
  canonicalizeJSON,
  verifyManifest,
  validateSemver,
  validatePublicKey,
} = require('../src/lib/verify');

describe('Verification library', () => {
  test('canonicalizeJSON should sort keys', () => {
    const input = {
      c: 3,
      a: 1,
      b: 2,
    };

    const expected = '{"a":1,"b":2,"c":3}';
    const result = canonicalizeJSON(input);

    expect(result).toBe(expected);
  });

  test('validateSemver should accept valid semvers', () => {
    expect(validateSemver('1.0.0')).toBe(true);
    expect(validateSemver('2.1.3')).toBe(true);
    expect(validateSemver('1.0.0-alpha')).toBe(true);
    expect(validateSemver('1.0.0+build.1')).toBe(true);
  });

  test('validateSemver should reject invalid semvers', () => {
    expect(validateSemver('1.0')).toBe(false);
    expect(validateSemver('invalid')).toBe(false);
    expect(validateSemver('1.0.0.0')).toBe(false);
  });

  test('validatePublicKey should accept valid keys', () => {
    // 32 zero bytes encoded in base58 is '11111111111111111111111111111111' (length 32),
    // but our strict check requires 32 decoded bytes. Construct a proper 32-byte base58 key.
    // Use a 32-byte buffer and encode to base58 manually with alphabet weights matching verify.js logic.
    // For simplicity in tests, use a known base58-32B example key (Bitcoin-style base58 without 0OIl):
    // Use a raw base58 key representing 32 zero bytes (32 leading '1's)
    const sampleKey = '1'.repeat(32);
    expect(validatePublicKey(sampleKey)).toBe(true);
  });

  test('validatePublicKey should reject invalid keys', () => {
    expect(validatePublicKey('invalid-key')).toBe(false);
  });

  test('verifyManifest should throw on invalid manifest', async () => {
    const invalidManifest = {
      manifest_version: '1.0',
      app: {
        name: 'test',
        namespace: 'example.test',
        developer_pubkey: '1'.repeat(32),
        id: 'test',
        alias: 'test',
      },
      version: {
        semver: '1.0.0',
      },
      supported_chains: ['test'],
      permissions: [],
      artifacts: [
        {
          type: 'wasm',
          target: 'test',
          cid: 'QmTest',
          size: 100,
        },
      ],
      metadata: {},
      distribution: 'ipfs',
      signature: {
        alg: 'Ed25519',
        pubkey: '1'.repeat(32),
        sig: 'invalidSignature123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
        signed_at: new Date().toISOString(),
      },
    };

    await expect(verifyManifest(invalidManifest)).rejects.toThrow();
  });
});
