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
    const sampleKey = '11111111111111111111111111111111';
    expect(validatePublicKey(sampleKey)).toBe(true);
  });

  test('validatePublicKey should reject invalid keys', () => {
    expect(validatePublicKey('invalid-key')).toBe(false);
  });

  test('verifyManifest should throw on invalid manifest', () => {
    const invalidManifest = {
      manifest_version: '1.0',
      app: {
        name: 'test',
        developer_pubkey: '11111111111111111111111111111111',
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
        sig: 'invalid-signature',
        signed_at: new Date().toISOString(),
      },
    };

    expect(() => verifyManifest(invalidManifest)).toThrow();
  });
});
