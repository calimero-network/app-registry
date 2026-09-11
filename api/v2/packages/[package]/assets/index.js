/**
 * Package assets — list, upload, reorder.
 *
 *   GET    /api/v2/packages/:package/assets   list (moderation-gated)
 *   POST   /api/v2/packages/:package/assets   upload one file (owner/org admin)
 *   PATCH  /api/v2/packages/:package/assets   reorder / re-caption
 *
 * Assets are registry-side state, NOT part of the signed bundle — that is the
 * only way a publisher can change them without republishing. See
 * lib/asset-store.js for why, and lib/asset-visibility.js for who can see what.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  listAssets,
  addAsset,
  updateAssets,
  MAX_ASSETS,
} = require('@calimero-network/registry-backend/src/lib/asset-store');
const {
  assetVisibility,
} = require('@calimero-network/registry-backend/src/lib/asset-visibility');
const {
  requireAuth,
  canManagePackage,
  NOT_OWNER_MESSAGE,
} = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');
const { resolveUser } = require('#api-lib/auth-helpers');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

/** The package's newest manifest, for the ownership check. */
async function latestManifest(pkg) {
  const store = getStorage();
  const versions = await store.getBundleVersions(pkg);
  if (!versions.length) return null;
  return store.getBundleManifest(pkg, versions[0]);
}

/** Assets are never handed out as bucket URLs — always proxied. See asset-visibility.js. */
const publicShape = (pkg, a) => ({
  id: a.id,
  kind: a.kind,
  contentType: a.contentType,
  bytes: a.bytes,
  alt: a.alt,
  order: a.order,
  url: `/api/v2/packages/${encodeURIComponent(pkg)}/assets/${a.id}/raw`,
});

module.exports = async function handler(req, res) {
  const pkg = req.query?.package;
  if (!pkg) {
    return res
      .status(400)
      .json({ error: 'invalid_request', message: 'Missing package.' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();

  const manifest = await latestManifest(pkg);
  if (!manifest) {
    return res
      .status(404)
      .json({ error: 'not_found', message: 'No such package.' });
  }

  // ── GET: moderation-gated read ──
  if (req.method === 'GET') {
    // An anonymous read is the common case, so this must not require auth —
    // it resolves the user only to decide whether a PENDING package's assets
    // are visible to them.
    const user = await resolveUser(req).catch(() => null);
    const admin = user?.email ? await isAdmin(user.email) : false;
    const owner = user ? await canManagePackage(pkg, manifest, user) : false;

    const vis = await assetVisibility({ pkg, isOwner: owner, isAdmin: admin });
    if (!vis.visible) {
      // Not 403: to an anonymous visitor a pending package simply has no
      // preview yet. A 403 would advertise that hidden assets exist.
      return res.status(200).json({ assets: [], state: vis.state });
    }
    const assets = await listAssets(pkg);
    return res.status(200).json({
      assets: assets.map(a => publicShape(pkg, a)),
      state: vis.state,
      // The owner needs to know their images are not public yet, or they will
      // assume the upload failed.
      pendingApproval: vis.state === 'pending',
    });
  }

  const user = await requireAuth(req, res);
  if (!user) return; // requireAuth already answered

  if (!(await canManagePackage(pkg, manifest, user))) {
    return res
      .status(403)
      .json({ error: 'not_owner', message: NOT_OWNER_MESSAGE });
  }

  // ── POST: upload ──
  if (req.method === 'POST') {
    // Body is base64 rather than multipart: these functions run on Vercel,
    // where parsing multipart means pulling in a parser and disabling the
    // built-in body handling. Base64 costs ~33% on the wire and needs neither.
    const b64 = req.body?.data;
    if (typeof b64 !== 'string' || !b64) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Send { data: "<base64>", alt?: "…" }.',
      });
    }
    let buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'data is not valid base64.',
      });
    }

    const result = await addAsset(pkg, buffer, { alt: req.body?.alt });
    if (!result.ok) {
      return res
        .status(400)
        .json({ error: result.error, message: result.message });
    }
    return res.status(201).json({
      asset: publicShape(pkg, result.asset),
      max: MAX_ASSETS,
    });
  }

  // ── PATCH: reorder / re-caption ──
  if (req.method === 'PATCH') {
    const updates = req.body?.assets;
    if (!Array.isArray(updates)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Send { assets: [{ id, alt? }, …] } in the desired order.',
      });
    }
    const next = await updateAssets(pkg, updates);
    return res.status(200).json({ assets: next.map(a => publicShape(pkg, a)) });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, OPTIONS');
  return res.status(405).json({ error: 'method_not_allowed' });
};
