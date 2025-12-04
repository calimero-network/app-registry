/**
 * Version Sorting Tests
 *
 * Tests that version sorting handles semver pre-release versions correctly
 */

const { BundleStorageKV } = require('../src/lib/bundle-storage-kv');

// Mock KV Client
const mockKVSets = new Map();

jest.mock('../src/lib/kv-client', () => ({
  kv: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    sAdd: jest.fn().mockResolvedValue(1),
    sMembers: jest.fn(async key => {
      const set = mockKVSets.get(key);
      return set ? Array.from(set) : [];
    }),
  },
}));

describe('Version Sorting', () => {
  let storage;

  beforeEach(() => {
    storage = new BundleStorageKV();
    mockKVSets.clear();
    jest.clearAllMocks();
  });

  test('should sort pre-release versions correctly', async () => {
    const versions = [
      '1.0.0',
      '1.0.0-beta.1',
      '1.0.0-alpha.2',
      '1.0.0-alpha.1',
      '1.0.0-rc.1',
    ];

    mockKVSets.set('bundle-versions:com.example.test', new Set(versions));

    const sorted = await storage.getBundleVersions('com.example.test');

    // Should be sorted descending (newest first)
    expect(sorted).toEqual([
      '1.0.0',
      '1.0.0-rc.1',
      '1.0.0-beta.1',
      '1.0.0-alpha.2',
      '1.0.0-alpha.1',
    ]);
  });

  test('should sort build metadata versions correctly', async () => {
    const versions = [
      '1.0.0+build.1',
      '1.0.0+build.2',
      '1.0.0',
      '1.0.0-alpha.1+build.1',
    ];

    mockKVSets.set('bundle-versions:com.example.test', new Set(versions));

    const sorted = await storage.getBundleVersions('com.example.test');

    // Build metadata should not affect sort order
    expect(sorted[0]).toBe('1.0.0+build.2');
    expect(sorted[1]).toBe('1.0.0+build.1');
    expect(sorted[2]).toBe('1.0.0');
  });

  test('should handle invalid semver versions gracefully', async () => {
    const versions = ['1.0.0', 'invalid-version', '2.0.0', 'not-semver'];

    mockKVSets.set('bundle-versions:com.example.test', new Set(versions));

    const sorted = await storage.getBundleVersions('com.example.test');

    // Valid semver versions should be sorted correctly
    expect(sorted[0]).toBe('2.0.0');
    expect(sorted[1]).toBe('1.0.0');

    // Invalid versions should still be included (at the end)
    expect(sorted).toContain('invalid-version');
    expect(sorted).toContain('not-semver');
  });

  test('should sort major.minor.patch versions correctly', async () => {
    const versions = ['1.0.0', '2.1.0', '1.1.0', '2.0.0', '1.0.1'];

    mockKVSets.set('bundle-versions:com.example.test', new Set(versions));

    const sorted = await storage.getBundleVersions('com.example.test');

    expect(sorted).toEqual(['2.1.0', '2.0.0', '1.1.0', '1.0.1', '1.0.0']);
  });
});
