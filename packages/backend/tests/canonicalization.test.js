/**
 * Canonicalization Tests
 *
 * Tests that canonicalization recursively sorts nested object keys
 */

// Import from the utility file
const { canonicalizeBundle } = require('../src/lib/v2-utils');

describe('Canonicalization', () => {
  test('should recursively sort nested object keys', () => {
    const bundle1 = {
      version: '1.0',
      package: 'com.example.test',
      appVersion: '1.0.0',
      metadata: {
        tags: ['a', 'b'], // Arrays maintain order
        name: 'Test',
        description: 'A test',
      },
      interfaces: {
        uses: ['a', 'b'], // Arrays maintain order
        exports: ['c', 'd'], // Arrays maintain order
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
        name: 'Test', // Different key order
        description: 'A test',
        tags: ['a', 'b'], // Same array order
      },
      interfaces: {
        exports: ['c', 'd'], // Same array order
        uses: ['a', 'b'], // Same array order
      },
      wasm: {
        size: 100, // Different key order
        path: 'app.wasm',
        hash: 'abc',
      },
    };

    // Both should produce the same canonical form (object keys sorted, arrays unchanged)
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
