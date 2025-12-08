/**
 * V2 Bundle Listing API
 * GET /api/v2/bundles
 * Returns: Array of bundle summaries
 *
 * Query parameters:
 * - package: Filter by package name
 * - version: Filter by version (requires package)
 * - developer: Filter by developer pubkey (from signature)
 */

const {
  BundleStorageKV,
} = require('../../../packages/backend/src/lib/bundle-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const store = getStorage();
    const { package: pkg, version, developer } = req.query || {};

    // If specific package and version requested, return single bundle
    if (pkg && version) {
      const bundle = await store.getBundleManifest(pkg, version);
      if (!bundle) {
        return res.status(404).json({
          error: 'bundle_not_found',
          message: `Bundle ${pkg}@${version} not found`,
        });
      }
      return res.status(200).json([bundle]);
    }

    // Get all bundle packages
    const allPackages = await store.getAllBundles();

    // Fetch all bundles with their latest versions
    const bundles = [];
    for (const packageName of allPackages) {
      // Filter by package if specified
      if (pkg && packageName !== pkg) {
        continue;
      }

      const versions = await store.getBundleVersions(packageName);
      if (versions.length === 0) {
        continue;
      }

      // Get latest version (first in sorted descending list)
      const latestVersion = versions[0];
      const bundle = await store.getBundleManifest(packageName, latestVersion);

      if (!bundle) {
        continue;
      }

      // Filter by developer pubkey if specified
      if (developer) {
        const bundlePubkey = bundle.signature?.pubkey;
        if (!bundlePubkey || bundlePubkey !== developer) {
          continue;
        }
      }

      bundles.push(bundle);
    }

    // Sort by package name
    bundles.sort((a, b) => a.package.localeCompare(b.package));

    return res.status(200).json(bundles);
  } catch (error) {
    console.error('Error listing bundles:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to list bundles',
    });
  }
};
