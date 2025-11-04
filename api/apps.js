/**
 * Apps List Endpoint (Frontend Compatibility)
 * GET /api/apps
 */

const { V1StorageKV } = require('../packages/backend/src/lib/v1-storage-kv');
const semver = require('semver');

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
    const {
      page = 1,
      limit = 20,
      dev = '',
      name = '',
      id = '',
      version = '',
      versions = '',
    } = req.query;

    const store = getStorage();

    // Handle version query: /api/apps?id=xxx&versions=true
    if (id && versions === 'true') {
      const appVersions = await store.getAppVersions(id);
      if (appVersions.length === 0) {
        return res.status(404).json({
          error: 'app_not_found',
          details: `App ${id} not found`,
        });
      }
      return res.status(200).json({
        id,
        versions: appVersions,
      });
    }

    // Handle manifest query: /api/apps?id=xxx&version=yyy
    if (id && version) {
      const manifest = await store.getManifest(id, version);
      if (!manifest) {
        return res.status(404).json({
          error: 'manifest_not_found',
          details: `Manifest ${id}@${version} not found`,
        });
      }
      return res.status(200).json(manifest);
    }

    // Default: list all apps
    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const offset = (pageNum - 1) * limitNum;
    const allManifests = await store.getAllManifests();

    // Filter by developer and name
    let filteredManifests = allManifests;

    if (dev) {
      filteredManifests = filteredManifests.filter(
        m => m.developer && m.developer.pubkey === dev
      );
    }

    if (name) {
      const nameLower = name.toLowerCase();
      filteredManifests = filteredManifests.filter(
        m =>
          m.name.toLowerCase().includes(nameLower) ||
          m.id.toLowerCase().includes(nameLower)
      );
    }

    // Get unique apps (latest version of each)
    const uniqueApps = new Map();
    filteredManifests.forEach(manifest => {
      if (!uniqueApps.has(manifest.id)) {
        uniqueApps.set(manifest.id, manifest);
      } else {
        const existing = uniqueApps.get(manifest.id);
        // Use semver for proper comparison
        if (semver.valid(manifest.version) && semver.valid(existing.version)) {
          if (semver.gt(manifest.version, existing.version)) {
            uniqueApps.set(manifest.id, manifest);
          }
        } else if (manifest.version > existing.version) {
          uniqueApps.set(manifest.id, manifest);
        }
      }
    });

    const apps = Array.from(uniqueApps.values());
    const paginatedApps = apps.slice(offset, offset + limitNum);

    // Convert to frontend format (AppSummary interface)
    const frontendApps = paginatedApps.map(manifest => ({
      id: manifest.id,
      name: manifest.name,
      alias: manifest.id,
      developer_pubkey: manifest.developer?.pubkey || 'dev-key-unknown',
      latest_version: manifest.version,
      developer: {
        display_name: manifest.developer?.name || 'Unknown Developer',
        pubkey: manifest.developer?.pubkey || 'dev-key-unknown',
      },
    }));

    return res.status(200).json(frontendApps);
  } catch (error) {
    console.error('Error in GET /apps:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message,
    });
  }
};
// Force rebuild 1762256340
