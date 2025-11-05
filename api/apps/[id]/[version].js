/**
 * Get App Manifest by ID and Version (Path-based endpoint)
 * GET /api/apps/:id/:version
 * Returns: Full manifest object
 */

const {
  V1StorageKV,
} = require('../../../packages/backend/src/lib/v1-storage-kv');

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
    // Extract ID and version from URL path (Vercel provides these as req.query)
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
    console.error('Error getting manifest:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message || 'Failed to get manifest',
    });
  }
};

