/**
 * Get App Versions Endpoint (Workaround for dynamic routes)
 * GET /api/app-versions?id=network.calimero.meropass
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
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        error: 'invalid_request',
        details: 'App ID is required',
      });
    }

    const store = getStorage();
    const versions = await store.getAppVersions(id);

    if (versions.length === 0) {
      return res.status(404).json({
        error: 'app_not_found',
        details: `App ${id} not found`,
      });
    }

    return res.status(200).json({
      id,
      versions,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in GET /app-versions:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message,
    });
  }
};
