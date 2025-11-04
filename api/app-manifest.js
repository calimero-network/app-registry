/**
 * Get App Manifest Endpoint (Workaround for dynamic routes)
 * GET /api/app-manifest?id=network.calimero.meropass&version=0.1.1
 */

const { V1StorageKV } = require('../packages/backend/src/lib/v1-storage-kv');

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
    const { id, version } = req.query;

    if (!id || !version) {
      return res.status(400).json({
        error: 'invalid_request',
        details: 'Both id and version are required',
      });
    }

    const store = getStorage();
    const manifest = await store.getManifest(id, version);

    if (!manifest) {
      return res.status(404).json({
        error: 'manifest_not_found',
        details: `Manifest ${id}@${version} not found`,
      });
    }

    return res.status(200).json(manifest);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in GET /app-manifest:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message,
    });
  }
};
