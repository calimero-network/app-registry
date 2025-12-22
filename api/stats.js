/**
 * Statistics Endpoint
 * GET /api/stats
 */

const {
  BundleStorageKV,
} = require('../packages/backend/src/lib/bundle-storage-kv');

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

    // Optimized: Get all bundle keys in parallel (O(packages) queries instead of O(packages × versions))
    const bundleKeys = await store.getAllBundleKeys();

    // Count total bundles (all versions)
    const totalBundles = bundleKeys.length;

    // Batch fetch all manifests in parallel (O(1) parallel queries instead of sequential)
    const bundles = await store.getBundleManifestsBatch(bundleKeys);

    // Count unique developers (from bundle signatures)
    const developers = new Set();
    for (const bundle of bundles) {
      if (bundle?.signature?.pubkey) {
        developers.add(bundle.signature.pubkey);
      }
    }

    // Count unique packages
    const uniquePackages = new Set(bundleKeys.map(k => k.package)).size;

    return res.status(200).json({
      publishedBundles: totalBundles,
      uniquePackages: uniquePackages,
      activeDevelopers: developers.size,
      totalDownloads: 0, // TODO: Implement download tracking
    });
  } catch (error) {
    console.error('Error in GET /stats:', error);
    return res.status(200).json({
      publishedBundles: 0,
      uniquePackages: 0,
      activeDevelopers: 0,
      totalDownloads: 0,
    });
  }
};
