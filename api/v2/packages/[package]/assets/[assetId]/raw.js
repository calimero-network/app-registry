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

  // ⚠️ THIS ORDER IS THE HOT PATH FOR EVERY IMAGE ON THE SITE.
  //
  // assetVisibility() answers `approved` from one review read and never looks
  // at isOwner/isAdmin — an approved package's assets are public, so the
  // asker cannot change the answer. This handler used to do the opposite:
  // read the package's version list, fetch a manifest, resolve the user,
  // check site admin and evaluate canManagePackage (a package→org lookup plus
  // a member-role read), and only then ask the question that had already been
  // decided. Six-odd sequential Redis round-trips before a single byte of a
  // public screenshot could be sent, on every tile of every app page.
  //
  // Now: ask first. Identity — and the manifest that ownership needs — is
  // resolved only on the branch where the asset is NOT public.
  const publicVis = await assetVisibility({ pkg });
  let vis = publicVis;

  if (!publicVis.visible) {
    const store = getStorage();
    const versions = await store.getBundleVersions(pkg);
    if (!versions.length) return res.status(404).json({ error: 'not_found' });
    const [manifest, user] = await Promise.all([
      store.getBundleManifest(pkg, versions[0]),
      resolveUser(req).catch(() => null),
    ]);
    if (user) {
      const [admin, owner] = await Promise.all([
        user.email ? isAdmin(user.email) : Promise.resolve(false),
        canManagePackage(pkg, manifest, user),
      ]);
      vis = await assetVisibility({ pkg, isOwner: owner, isAdmin: admin });
    }
  }

  if (!vis.visible) {
    // 404, not 403: a pending asset should be indistinguishable from one that
    // does not exist, or the endpoint confirms hidden content by its status.
    return res.status(404).json({ error: 'not_found' });
  }

  // `?variant=thumb` serves the downscaled copy. Anything else — including a
  // missing thumbnail on an older asset — serves the original.
  const variant = req.query?.variant === 'thumb' ? 'thumb' : 'full';
  const found = await readAsset(pkg, assetId, { variant });
  if (!found) return res.status(404).json({ error: 'not_found' });

  // ⚠️ THE TYPE OF WHAT WAS READ, NOT OF THE ASSET RECORD. The thumbnail is a
  // WebP re-encode of whatever was uploaded, so serving it as the original's
  // `image/png` hands the browser a file it will not decode.
  res.setHeader('Content-Type', found.contentType);
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
