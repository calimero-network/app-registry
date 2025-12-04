/**
 * Canonicalization Tests
 *
 * Tests that canonicalization recursively sorts nested object keys
 */

// Import from the API endpoint file
const { canonicalizeBundle } = require('../../../api/v2/bundles/push');

describe('Canonicalization', () => {
  test('should recursively sort nested object keys', () => {
    const bundle1 = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      metadata: {
        tags: ['b', 'a'],
        name: 'Test',
        description: 'A test',
      },
      interfaces: {
        uses: ['b', 'a'],
        exports: ['d', 'c'],
      },
      wasm: {
        hash: 'abc',
        path: 'app.wasm',
        size: 100,
      },
    };

    const bundle2 = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      metadata: {
        name: 'Test',
        description: 'A test',
        tags: ['a', 'b'],
      },
      interfaces: {
        exports: ['c', 'd'],
        uses: ['a', 'b'],
      },
      wasm: {
        size: 100,
        path: 'app.wasm',
        hash: 'abc',
      },
    };

    // Both should produce the same canonical form
    const canonical1 = canonicalizeBundle(bundle1);
    const canonical2 = canonicalizeBundle(bundle2);

    expect(canonical1).toBe(canonical2);
  });

  test('should handle deeply nested objects', () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      metadata: {
        nested: {
          deep: {
            z: 3,
            a: 1,
            b: 2,
          },
        },
      },
    };

    const canonical = canonicalizeBundle(bundle);
    const parsed = JSON.parse(canonical);

    // Verify keys are sorted at all levels
    expect(Object.keys(parsed.metadata.nested.deep)).toEqual(['a', 'b', 'z']);
  });

  test('should handle arrays of objects', () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      migrations: [
        { path: 'migration2.wasm', size: 200 },
        { path: 'migration1.wasm', size: 100 },
      ],
    };

    const canonical = canonicalizeBundle(bundle);
    const parsed = JSON.parse(canonical);

    // Verify array items have sorted keys
    expect(Object.keys(parsed.migrations[0])).toEqual(['path', 'size']);
    expect(Object.keys(parsed.migrations[1])).toEqual(['path', 'size']);
  });

  test('should remove signature before canonicalization', () => {
    const bundle = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      signature: {
        alg: 'ed25519',
        sig: 'test',
        pubkey: 'test',
        signedAt: '2024-01-01',
      },
    };

    const canonical = canonicalizeBundle(bundle);
    const parsed = JSON.parse(canonical);

    expect(parsed.signature).toBeUndefined();
  });
});
