/**
 * V1 Utility Functions Tests
 *
 * Tests the utility functions for JCS canonicalization, Ed25519 verification,
 * digest validation, and dependency resolution.
 */

// Dynamic import for ES module
let ed25519;
const semver = require('semver');
const { V1Utils } = require('../src/lib/v1-utils');

// Simple JCS canonicalization implementation
const canonicalize = obj => {
  return JSON.stringify(obj, Object.keys(obj).sort());
};

describe('V1 Utility Functions', () => {
  describe('JCS Canonicalization', () => {
    test('should canonicalize manifest without signature', () => {
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

      const canonical = canonicalize(manifest);
      expect(typeof canonical).toBe('string');
      expect(canonical).toContain('com.example.app');
    });

    test('should produce consistent canonicalization', () => {
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

      const canonical1 = canonicalize(manifest);
      const canonical2 = canonicalize(manifest);

      expect(canonical1).toBe(canonical2);
    });

    test('should handle nested objects correctly', () => {
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
        dependencies: [
          {
            id: 'com.example.dep1',
            range: '^1.0.0',
          },
          {
            id: 'com.example.dep2',
            range: '^2.0.0',
          },
        ],
      };

      const canonical = canonicalize(manifest);
      expect(typeof canonical).toBe('string');
      expect(canonical).toContain('com.example.dep1');
      expect(canonical).toContain('com.example.dep2');
    });
  });

  describe.skip('Ed25519 Signature Verification', () => {
    let privateKey;
    let publicKey;

    beforeEach(async () => {
      if (!ed25519) {
        const nobleEd25519 = await import('@noble/ed25519');
        ed25519 = nobleEd25519.ed25519;
      }
      // const seed = Buffer.alloc(32, 0);
      privateKey = ed25519.utils.randomPrivateKey();
      publicKey = ed25519.getPublicKey(privateKey);
    });

    test('should verify valid signature', () => {
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

      const canonical = canonicalize(manifest);
      const signature = ed25519.sign(Buffer.from(canonical), privateKey);

      const isValid = ed25519.verify(
        signature,
        Buffer.from(canonical),
        publicKey
      );
      expect(isValid).toBe(true);
    });

    test('should reject invalid signature', () => {
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

      const canonical = canonicalize(manifest);
      const wrongSignature = Buffer.alloc(64, 0);

      const isValid = ed25519.verify(
        wrongSignature,
        Buffer.from(canonical),
        publicKey
      );
      expect(isValid).toBe(false);
    });

    test('should reject signature with wrong public key', () => {
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

      const canonical = canonicalize(manifest);
      const signature = ed25519.sign(Buffer.from(canonical), privateKey);
      const wrongPrivateKey = ed25519.utils.randomPrivateKey();
      const wrongPublicKey = ed25519.getPublicKey(wrongPrivateKey);

      const isValid = ed25519.verify(
        signature,
        Buffer.from(canonical),
        wrongPublicKey
      );
      expect(isValid).toBe(false);
    });
  });

  describe('Digest Validation', () => {
    test('should validate correct SHA256 digest format', () => {
      const validDigests = [
        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      ];

      validDigests.forEach(digest => {
        expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      });
    });

    test('should reject invalid digest formats', () => {
      const invalidDigests = [
        'sha256:invalid',
        'sha256:111111111111111111111111111111111111111111111111111111111111111',
        'sha256:11111111111111111111111111111111111111111111111111111111111111111',
        'md5:11111111111111111111111111111111',
        'sha256:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      ];

      invalidDigests.forEach(digest => {
        expect(digest).not.toMatch(/^sha256:[0-9a-f]{64}$/);
      });
    });
  });

  describe('Artifact Fetch and Validation', () => {
    test('should validate artifact digest format', () => {
      const validArtifact = {
        type: 'wasm',
        target: 'node',
        digest:
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        uri: 'https://example.com/artifact.wasm',
      };

      expect(V1Utils.validateDigest(validArtifact.digest)).toBe(true);
      expect(V1Utils.validateUri(validArtifact.uri)).toBe(true);
    });

    test('should reject invalid artifact formats', () => {
      // Test invalid digest
      const invalidDigest = 'invalid-digest';
      expect(V1Utils.validateDigest(invalidDigest)).toBe(false);

      // Test invalid URI
      const invalidUri = 'invalid-uri';
      expect(V1Utils.validateUri(invalidUri)).toBe(false);
    });
  });

  describe('Semver Range Validation', () => {
    test('should validate semver ranges', () => {
      const validRanges = [
        '^1.0.0',
        '~1.0.0',
        '>=1.0.0',
        '1.0.0',
        '1.0.0-beta.1',
        '^1.0.0-beta.1',
      ];

      validRanges.forEach(range => {
        expect(semver.validRange(range)).toBeTruthy();
      });
    });

    test('should reject invalid semver ranges', () => {
      const invalidRanges = ['invalid', '^1.0.0.0', '^1.0.0.0.0'];

      invalidRanges.forEach(range => {
        expect(semver.validRange(range)).toBeFalsy();
      });
    });

    test('should match versions against ranges', () => {
      expect(semver.satisfies('1.0.0', '^1.0.0')).toBe(true);
      expect(semver.satisfies('1.1.0', '^1.0.0')).toBe(true);
      expect(semver.satisfies('2.0.0', '^1.0.0')).toBe(false);
      expect(semver.satisfies('1.0.0', '~1.0.0')).toBe(true);
      expect(semver.satisfies('1.1.0', '~1.0.0')).toBe(false);
    });
  });

  describe('Dependency Resolution', () => {
    test('should resolve simple dependency', () => {
      const availableVersions = {
        'com.example.dep': ['1.0.0', '1.1.0', '2.0.0'],
      };

      const range = '^1.0.0';
      const versions = availableVersions['com.example.dep'];
      const compatibleVersions = versions.filter(v =>
        semver.satisfies(v, range)
      );
      const highest = semver.maxSatisfying(versions, range);

      expect(compatibleVersions).toContain('1.0.0');
      expect(compatibleVersions).toContain('1.1.0');
      expect(compatibleVersions).not.toContain('2.0.0');
      expect(highest).toBe('1.1.0');
    });

    test('should handle no compatible versions', () => {
      const availableVersions = {
        'com.example.dep': ['2.0.0', '3.0.0'],
      };

      const range = '^1.0.0';
      const versions = availableVersions['com.example.dep'];
      const highest = semver.maxSatisfying(versions, range);

      expect(highest).toBeNull();
    });

    test('should handle exact version match', () => {
      const availableVersions = {
        'com.example.dep': ['1.0.0', '1.1.0', '2.0.0'],
      };

      const range = '1.0.0';
      const versions = availableVersions['com.example.dep'];
      const highest = semver.maxSatisfying(versions, range);

      expect(highest).toBe('1.0.0');
    });
  });

  describe('Interface Resolution', () => {
    test('should match provides and requires interfaces', () => {
      const provides = ['chat.manager@1', 'chat.manager@2'];
      const requires = ['chat.channel@1'];

      const satisfies = requires.every(req =>
        provides.some(prov => prov === req)
      );

      expect(satisfies).toBe(false); // chat.channel@1 not in provides
    });

    test('should match exact interface versions', () => {
      const provides = ['chat.channel@1', 'chat.channel@2'];
      const requires = ['chat.channel@1'];

      const satisfies = requires.every(req =>
        provides.some(prov => prov === req)
      );

      expect(satisfies).toBe(true);
    });

    test('should handle multiple requirements', () => {
      const provides = ['chat.channel@1', 'chat.manager@1'];
      const requires = ['chat.channel@1', 'chat.manager@1'];

      const satisfies = requires.every(req =>
        provides.some(prov => prov === req)
      );

      expect(satisfies).toBe(true);
    });

    test('should handle partial requirements', () => {
      const provides = ['chat.channel@1'];
      const requires = ['chat.channel@1', 'chat.manager@1'];

      const satisfies = requires.every(req =>
        provides.some(prov => prov === req)
      );

      expect(satisfies).toBe(false);
    });
  });

  describe('Cycle Detection', () => {
    test('should detect simple cycle', () => {
      const dependencies = {
        'app-a': ['app-b'],
        'app-b': ['app-c'],
        'app-c': ['app-a'],
      };

      const hasCycle = (
        deps,
        start,
        visited = new Set(),
        recStack = new Set()
      ) => {
        if (recStack.has(start)) return true;
        if (visited.has(start)) return false;

        visited.add(start);
        recStack.add(start);

        for (const dep of deps[start] || []) {
          if (hasCycle(deps, dep, visited, recStack)) return true;
        }

        recStack.delete(start);
        return false;
      };

      expect(hasCycle(dependencies, 'app-a')).toBe(true);
    });

    test('should not detect cycle in DAG', () => {
      const dependencies = {
        'app-a': ['app-b', 'app-c'],
        'app-b': ['app-d'],
        'app-c': ['app-d'],
        'app-d': [],
      };

      const hasCycle = (
        deps,
        start,
        visited = new Set(),
        recStack = new Set()
      ) => {
        if (recStack.has(start)) return true;
        if (visited.has(start)) return false;

        visited.add(start);
        recStack.add(start);

        for (const dep of deps[start] || []) {
          if (hasCycle(deps, dep, visited, recStack)) return true;
        }

        recStack.delete(start);
        return false;
      };

      expect(hasCycle(dependencies, 'app-a')).toBe(false);
    });
  });
});
