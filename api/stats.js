/**
 * Statistics Endpoint
 * GET /api/stats
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
  try {
    const store = getStorage();
    const apps = await store.getApps();
    const manifests = await store.getAllManifests();

    // Count unique developers
    const developers = new Set();
    manifests.forEach(m => {
      if (m.signature && m.signature.pubkey) {
        developers.add(m.signature.pubkey);
      }
    });

    return res.status(200).json({
      publishedApps: apps.length,
      activeDevelopers: developers.size,
      totalDownloads: 0, // TODO: Implement download tracking
      totalManifests: manifests.length,
    });
  } catch (error) {
    console.error('Error in GET /stats:', error);
    return res.status(200).json({
      publishedApps: 0,
      activeDevelopers: 0,
      totalDownloads: 0,
      totalManifests: 0,
    });
  }
};
