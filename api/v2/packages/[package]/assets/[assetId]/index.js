/**
 * DELETE /api/v2/packages/:package/assets/:assetId
 *
 * Removes the GCS object and then the index entry — in that order. Dropping
 * the index first orphans the bytes, which is exactly the leak package delete
 * already has (`.mpk` blobs stay publicly readable after a delete). Repeating
 * it here would strand user-uploaded images in a public bucket forever.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  removeAsset,
} = require('@calimero-network/registry-backend/src/lib/asset-store');
const {
  requireAuth,
  canManagePackage,
  NOT_OWNER_MESSAGE,
} = require('#api-lib/auth-helpers');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const pkg = req.query?.package;
  const assetId = req.query?.assetId;
  if (!pkg || !assetId)
    return res.status(400).json({ error: 'invalid_request' });

  const store = getStorage();
  const versions = await store.getBundleVersions(pkg);
  if (!versions.length) return res.status(404).json({ error: 'not_found' });
  const manifest = await store.getBundleManifest(pkg, versions[0]);

  const user = await requireAuth(req, res);
  if (!user) return;
  if (!(await canManagePackage(pkg, manifest, user))) {
    return res
      .status(403)
      .json({ error: 'not_owner', message: NOT_OWNER_MESSAGE });
  }

  const removed = await removeAsset(pkg, assetId);
  if (!removed) return res.status(404).json({ error: 'not_found' });
  return res.status(200).json({ message: 'Asset removed', id: assetId });
};
