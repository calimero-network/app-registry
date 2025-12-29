/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 * Returns: Bundle Manifest JSON
 */

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    const {
      BundleStorageKV,
    } = require('../../../../packages/backend/src/lib/bundle-storage-kv');
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async (req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }

  // Set CORS headers for all other requests
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel route params are passed in req.query
    const { package: pkg, version } = req.query;

    if (!pkg || !version) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'Package and version parameters are required',
      });
    }

    const store = getStorage();
    const bundle = await store.getBundleManifest(pkg, version);

    if (!bundle) {
      return res.status(404).json({
        error: 'bundle_not_found',
        message: `Bundle ${pkg}@${version} not found`,
      });
    }

    return res.status(200).json(bundle);
  } catch (error) {
    console.error('Error fetching bundle manifest:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to fetch bundle manifest',
    });
  }
};
