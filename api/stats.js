/**
 * Statistics Endpoint
 * GET /api/stats
 */

const { BundleStorageKV } = require('../packages/backend/src/lib/bundle-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async (req, res) => {
  try {
    const store = getStorage();
    const bundles = await store.getAllBundles();

    // Count unique developers (from bundle signatures)
    const developers = new Set();
    for (const pkg of bundles) {
      const versions = await store.getBundleVersions(pkg);
      for (const version of versions) {
        const bundle = await store.getBundleManifest(pkg, version);
        if (bundle?.signature?.pubkey) {
          developers.add(bundle.signature.pubkey);
        }
      }
    }

    return res.status(200).json({
      publishedBundles: bundles.length,
      activeDevelopers: developers.size,
      totalDownloads: 0, // TODO: Implement download tracking
    });
  } catch (error) {
    console.error('Error in GET /stats:', error);
    return res.status(200).json({
      publishedBundles: 0,
      activeDevelopers: 0,
      totalDownloads: 0,
    });
  }
};
