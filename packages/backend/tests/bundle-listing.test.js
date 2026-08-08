/**
 * Shared Bundle Listing Tests
 *
 * buildBundleListing is the single post-processing path behind both copies of
 * GET /api/v2/bundles (the deployed Vercel function and the Fastify server).
 * Those copies previously each had their own filter/sanitize/count/sort block
 * and had already drifted apart, so this is the seam worth pinning directly.
 */

const store = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  sMembers: async () => [],
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

const { buildBundleListing } = require('../src/lib/bundle-listing');

function entry(packageName, version, overrides = {}) {
  const { yanked, ...bundleOverrides } = overrides;
  return {
    packageName,
    version,
    ...(yanked === undefined ? {} : { yanked }),
    bundle: {
      package: packageName,
      appVersion: version,
      metadata: { author: `author-${packageName}` },
      signature: { pubkey: `pk-${packageName}` },
      ...bundleOverrides,
    },
  };
}

beforeEach(() => store.clear());

describe('buildBundleListing', () => {
  test('sorts by package name', async () => {
    const result = await buildBundleListing({
      entries: [
        entry('com.c', '1.0.0'),
        entry('com.a', '1.0.0'),
        entry('com.b', '1.0.0'),
      ],
      kv: mockKv,
    });

    expect(result.map(b => b.package)).toEqual(['com.a', 'com.b', 'com.c']);
  });

  test('keeps version order within a package (stable sort)', async () => {
    const result = await buildBundleListing({
      entries: [
        entry('com.a', '2.0.0'),
        entry('com.a', '1.10.0'),
        entry('com.a', '1.2.0'),
      ],
      kv: mockKv,
    });

    expect(result.map(b => b.appVersion)).toEqual(['2.0.0', '1.10.0', '1.2.0']);
  });

  test('merges download counts by lowercased package key', async () => {
    store.set('downloads:com.mixed.case', '42');

    const result = await buildBundleListing({
      entries: [entry('Com.Mixed.Case', '1.0.0')],
      kv: mockKv,
    });

    expect(result[0].downloads).toBe(42);
  });

  test('reports 0 downloads when the counter is absent or junk', async () => {
    store.set('downloads:com.b', 'not-a-number');

    const result = await buildBundleListing({
      entries: [entry('com.a', '1.0.0'), entry('com.b', '1.0.0')],
      kv: mockKv,
    });

    expect(result.map(b => b.downloads)).toEqual([0, 0]);
  });

  test('filters by developer pubkey', async () => {
    const result = await buildBundleListing({
      entries: [entry('com.a', '1.0.0'), entry('com.b', '1.0.0')],
      kv: mockKv,
      developer: 'pk-com.b',
    });

    expect(result.map(b => b.package)).toEqual(['com.b']);
  });

  test('filters by author, falling back to _ownerEmail for legacy bundles', async () => {
    const legacy = entry('com.legacy', '1.0.0', {
      metadata: { _ownerEmail: 'old@example.com' },
    });

    const result = await buildBundleListing({
      entries: [entry('com.a', '1.0.0'), legacy],
      kv: mockKv,
      author: 'old@example.com',
    });

    expect(result.map(b => b.package)).toEqual(['com.legacy']);
  });

  test('a bundle missing the filtered field is excluded, not included', async () => {
    const unsigned = entry('com.unsigned', '1.0.0', { signature: undefined });

    const result = await buildBundleListing({
      entries: [unsigned],
      kv: mockKv,
      developer: 'pk-anything',
    });

    expect(result).toEqual([]);
  });

  test('yanked is surfaced only when the caller asked for it', async () => {
    const withFlag = await buildBundleListing({
      entries: [entry('com.a', '1.0.0', { yanked: true })],
      kv: mockKv,
    });
    expect(withFlag[0].yanked).toBe(true);

    // Callers that did not request yank flags must not grow the field, or the
    // browse listing would start advertising every bundle as not-yanked.
    const withoutFlag = await buildBundleListing({
      entries: [entry('com.a', '1.0.0')],
      kv: mockKv,
    });
    expect('yanked' in withoutFlag[0]).toBe(false);
  });

  test('strips internal metadata while still computing verified', async () => {
    const result = await buildBundleListing({
      entries: [
        entry('com.a', '1.0.0', {
          metadata: {
            author: 'alice',
            _ownerEmail: 'alice@calimero.network',
            _adminVerified: false,
          },
        }),
      ],
      kv: mockKv,
    });

    expect(result[0].metadata._ownerEmail).toBeUndefined();
    expect(result[0].metadata._adminVerified).toBeUndefined();
    expect(result[0].verified).toBe(true);
  });

  test('an empty entry list yields an empty listing', async () => {
    await expect(
      buildBundleListing({ entries: [], kv: mockKv })
    ).resolves.toEqual([]);
  });
});
