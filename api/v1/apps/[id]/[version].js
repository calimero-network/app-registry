/**
 * Get Specific Manifest Endpoint
 * GET /api/v1/apps/:id/:version
 */

const { V1StorageKV } = require('../../../../packages/backend/src/lib/v1-storage-kv');

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
        details: 'Both app ID and version are required',
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

    // Check if canonical JCS is requested
    const { canonical } = req.query;
    if (canonical === 'true') {
      const manifestWithCanonical = await store.getManifestWithCanonical(id, version);
      return res.status(200).json(manifestWithCanonical);
    }

    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Error in GET /v1/apps/:id/:version:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message,
    });
  }
};

