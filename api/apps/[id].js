/**
 * Get App Versions by ID (Path-based endpoint)
 * GET /api/apps/:id
 * Returns: { id: string, versions: string[] }
 */

const { V1StorageKV } = require('../../packages/backend/src/lib/v1-storage-kv');

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
    // Extract ID from URL path (Vercel provides this as req.query)
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
    console.error('Error getting app versions:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message || 'Failed to get app versions',
    });
  }
};
