/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 * Returns: Bundle Manifest JSON
 */

const {
  BundleStorageKV,
} = require('../../../../packages/backend/src/lib/bundle-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async (req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

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
