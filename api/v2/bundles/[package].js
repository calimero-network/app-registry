/**
 * V2 Bundle Package API
 * DELETE /api/v2/bundles/:package - Delete an entire package (all versions)
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const { requireAuth } = require('../../lib/auth-helpers');

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

function manifestOwnedByUser(manifest, user) {
  const author = manifest?.metadata?.author;
  const ownerEmail = manifest?.metadata?._ownerEmail;

  if (user?.username && author === user.username) return true;
  if (user?.email && ownerEmail === user.email) return true;
  if (user?.email && !user?.username && author === user.email) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { package: pkg } = req.query;
  if (!pkg) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const store = getStorage();

  let versions;
  try {
    versions = await store.getBundleVersions(pkg);
  } catch (e) {
    console.error('DELETE package getBundleVersions:', e);
    return res.status(500).json({
      error: 'internal_error',
      message: e?.message ?? String(e),
    });
  }

  if (!versions || versions.length === 0) {
    return res.status(404).json({
      error: 'package_not_found',
      message: `Package ${pkg} not found`,
    });
  }

  // Check ownership from the latest version
  let latest;
  try {
    latest = await store.getBundleManifest(pkg, versions[0]);
  } catch (e) {
    console.error('DELETE package getBundleManifest:', e);
    return res.status(500).json({
      error: 'internal_error',
      message: e?.message ?? String(e),
    });
  }

  if (!manifestOwnedByUser(latest, user)) {
    return res.status(403).json({
      error: 'not_owner',
      message: 'Only the package author can delete this package.',
    });
  }

  try {
    await store.deletePackage(pkg);
    return res.status(200).json({ message: `Deleted package ${pkg}` });
  } catch (error) {
    console.error('DELETE package error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
