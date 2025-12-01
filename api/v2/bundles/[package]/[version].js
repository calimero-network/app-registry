/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 * Returns: Bundle Manifest JSON
 */

const {
  V1StorageKV,
} = require('../../../packages/backend/src/lib/v1-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new V1StorageKV();
  }
  return storage;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel route params are passed in req.query
    // But since this is a [package]/[version].js route,
    // package and version should be available in req.query
    const { package: pkg, version } = req.query;

    if (!pkg || !version) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Package and version are required',
      });
    }

    const store = getStorage();
    const manifest = await store.getBundleManifest(pkg, version);

    if (!manifest) {
      return res.status(404).json({
        error: 'manifest_not_found',
        message: `Manifest not found for ${pkg}@${version}`,
      });
    }

    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Error getting bundle manifest:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to get manifest',
    });
  }
};
