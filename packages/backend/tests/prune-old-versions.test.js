/**
 * A publish keeps only the newest BUNDLE_KEEP_VERSIONS of its package.
 */

jest.mock('../src/lib/kv-client', () => ({
  kv: {},
  isDevelopment: true,
  isProduction: false,
}));

const {
  BundleStorageKV,
  keepVersions,
} = require('../src/lib/bundle-storage-kv');

function storeWith(versions) {
  const store = new BundleStorageKV();
  store.getBundleVersions = jest.fn(async () => versions);
  store.deleteBundleVersion = jest.fn(async () => {});
  return store;
}

describe('pruneOldVersions', () => {
  it('deletes everything past the newest `keep`', async () => {
    const store = storeWith([
      '1.0.6',
      '1.0.5',
      '1.0.4',
      '1.0.3',
      '1.0.2',
      '1.0.1',
    ]);
    const deleted = await store.pruneOldVersions('com.x', 5);
    expect(deleted).toEqual(['1.0.1']);
    expect(store.deleteBundleVersion).toHaveBeenCalledWith('com.x', '1.0.1');
    expect(store.deleteBundleVersion).toHaveBeenCalledTimes(1);
  });

  it('leaves a package at or under the limit alone', async () => {
    const store = storeWith(['1.0.2', '1.0.1']);
    expect(await store.pruneOldVersions('com.x', 5)).toEqual([]);
    expect(store.deleteBundleVersion).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const store = storeWith(['3', '2', '1']);
    expect(await store.pruneOldVersions('com.x', 0)).toEqual([]);
    expect(store.getBundleVersions).not.toHaveBeenCalled();
  });

  it('skips a failed delete and keeps going', async () => {
    const store = storeWith(['4', '3', '2', '1']);
    store.deleteBundleVersion.mockImplementation(async (_p, v) => {
      if (v === '2') throw new Error('boom');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await store.pruneOldVersions('com.x', 1)).toEqual(['3', '1']);
  });
});

describe('keepVersions', () => {
  it('defaults to 5 and reads BUNDLE_KEEP_VERSIONS', () => {
    expect(keepVersions({})).toBe(5);
    expect(keepVersions({ BUNDLE_KEEP_VERSIONS: '3' })).toBe(3);
    expect(keepVersions({ BUNDLE_KEEP_VERSIONS: '0' })).toBe(0);
    expect(keepVersions({ BUNDLE_KEEP_VERSIONS: 'lots' })).toBe(5);
  });
});

describe('makeRoomFor', () => {
  it('leaves keep - 1 versions so the new one makes keep', async () => {
    const store = storeWith(['5', '4', '3', '2', '1']);
    store.bundleExists = jest.fn(async () => false);
    expect(await store.makeRoomFor('com.x', '6', 5)).toEqual(['1']);
  });

  it('never deletes the last version (that would retire the name)', async () => {
    const store = storeWith(['2', '1']);
    store.bundleExists = jest.fn(async () => false);
    expect(await store.makeRoomFor('com.x', '3', 1)).toEqual(['1']);
    expect(store.deleteBundleVersion).not.toHaveBeenCalledWith('com.x', '2');
  });

  it('does nothing for a version that already exists', async () => {
    const store = storeWith(['5', '4', '3', '2', '1']);
    store.bundleExists = jest.fn(async () => true);
    expect(await store.makeRoomFor('com.x', '5', 5)).toEqual([]);
    expect(store.deleteBundleVersion).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const store = storeWith(['5', '4', '3', '2', '1']);
    store.bundleExists = jest.fn(async () => false);
    expect(await store.makeRoomFor('com.x', '6', 0)).toEqual([]);
  });
});

describe('storeBundleManifest beforeWrite', () => {
  it('is not called for a bundle refused by its own checks', async () => {
    const store = new BundleStorageKV();
    const beforeWrite = jest.fn();
    await expect(
      store.storeBundleManifest(
        { package: 'com.x', appVersion: '1.0.0', _binary: 'not hex' },
        false,
        { beforeWrite }
      )
    ).rejects.toThrow();
    expect(beforeWrite).not.toHaveBeenCalled();
  });
});
