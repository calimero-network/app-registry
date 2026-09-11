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
const publicShape = (pkg, a) => {
  const base = `/api/v2/packages/${encodeURIComponent(pkg)}/assets/${a.id}/raw`;
  return {
    id: a.id,
    kind: a.kind,
    contentType: a.contentType,
    bytes: a.bytes,
    alt: a.alt,
    order: a.order,
    url: base,
    // What the strip loads. Falls back to the full object for the assets
    // uploaded before thumbnails existed, so a caller can always just use
    // `thumbUrl` for a tile and `url` when it opens full screen.
    thumbUrl: a.thumbKey ? `${base}?variant=thumb` : base,
    hasThumb: !!a.thumbKey,
    thumbBytes: a.thumbBytes ?? null,
    // For the tile's `width`/`height` attributes: it can then reserve the
    // right box before any bytes arrive instead of collapsing and shoving the
    // page around when they land.
    width: a.width ?? null,
    height: a.height ?? null,
  };
};

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
    // ⚠️ THE APPROVAL CHECK COMES FIRST, AND THAT IS A PERFORMANCE FIX.
    //
    // assetVisibility() returns on `approved` without ever reading isOwner or
    // isAdmin — an approved package's assets are public, so who is asking
    // cannot change the answer. This used to resolve the user, look up site
    // admin and evaluate canManagePackage (itself a package→org lookup plus a
    // member-role read) BEFORE asking, so the overwhelmingly common request —
    // an anonymous visitor loading an approved app page — paid for four or
    // five Redis round-trips whose results were then discarded.
    //
    // Identity is now resolved only when the cheap answer is "not public",
    // which is the only branch that needs it.
    const publicVis = await assetVisibility({ pkg });
    let vis = publicVis;
    if (!publicVis.visible) {
      const user = await resolveUser(req).catch(() => null);
      if (user) {
        const [admin, owner] = await Promise.all([
          user.email ? isAdmin(user.email) : Promise.resolve(false),
          canManagePackage(pkg, manifest, user),
        ]);
        vis = await assetVisibility({ pkg, isOwner: owner, isAdmin: admin });
      }
    }
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
    let thumb = null;
    try {
      buffer = Buffer.from(b64, 'base64');
      // Optional: a downscaled copy the browser made. Bad base64 here is not
      // worth failing the upload over — the original is what matters, and a
      // missing thumbnail degrades to serving the full image.
      if (typeof req.body?.thumb === 'string' && req.body.thumb) {
        try {
          thumb = Buffer.from(req.body.thumb, 'base64');
        } catch {
          thumb = null;
        }
      }
    } catch {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'data is not valid base64.',
      });
    }

    const result = await addAsset(pkg, buffer, {
      alt: req.body?.alt,
      thumb,
      width: Number(req.body?.width) || null,
      height: Number(req.body?.height) || null,
    });
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
