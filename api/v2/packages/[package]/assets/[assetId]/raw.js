/**
 * GET /api/v2/packages/:package/assets/:assetId/raw
 *
 * Serves the bytes.
 *
 * ⚠️ EVERY asset read goes through here, including approved ones. The bucket
 * URL is never handed out, because "private" has to mean private at the bytes:
 * an object name is guessable and a public GCS URL never expires, so hiding a
 * pending asset from the JSON listing while its object stays readable is not
 * moderation at all. Routing reads through the API is what lets
 * assetVisibility run on each one.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  readAsset,
} = require('@calimero-network/registry-backend/src/lib/asset-store');
const {
  assetVisibility,
} = require('@calimero-network/registry-backend/src/lib/asset-visibility');
const { resolveUser, canManagePackage } = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const pkg = req.query?.package;
  const assetId = req.query?.assetId;
  if (!pkg || !assetId) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const store = getStorage();
  const versions = await store.getBundleVersions(pkg);
  if (!versions.length) return res.status(404).json({ error: 'not_found' });
  const manifest = await store.getBundleManifest(pkg, versions[0]);

  const user = await resolveUser(req).catch(() => null);
  const admin = user?.email ? await isAdmin(user.email) : false;
  const owner = user ? await canManagePackage(pkg, manifest, user) : false;

  const vis = await assetVisibility({ pkg, isOwner: owner, isAdmin: admin });
  if (!vis.visible) {
    // 404, not 403: a pending asset should be indistinguishable from one that
    // does not exist, or the endpoint confirms hidden content by its status.
    return res.status(404).json({ error: 'not_found' });
  }

  const found = await readAsset(pkg, assetId);
  if (!found) return res.status(404).json({ error: 'not_found' });

  res.setHeader('Content-Type', found.asset.contentType);
  // Approved assets are immutable per id, so they cache hard. A pending one
  // must not be cached by any shared cache — approval state can change and an
  // edge cache would keep serving the pre-approval answer.
  res.setHeader(
    'Cache-Control',
    vis.state === 'approved'
      ? 'public, max-age=31536000, immutable'
      : 'private, no-store'
  );
  return res.status(200).send(found.buffer);
};
