/**
 * GET /api/v2/packages/:package — everything a client needs about one
 * package, in one request.
 *
 * `{ package, metadata, assets, bundle, review }`.
 *
 * This exists because `admin-dashboard` and `calimero-desktop` both want
 * metadata + pictures + the installable bundle, and the only way to get that
 * today is `/api/v2/bundles?package=…` followed by a second call per package
 * for its assets. That N+1 would be written twice, in two products, against a
 * registry that proxies every read.
 *
 * ⚠️ THIS IS A PUBLIC, UNAUTHENTICATED READ, AND IT IS EXACTLY WHERE A
 * MODERATION GATE GETS FORGOTTEN. Assets go through the same
 * `assetVisibility` check as the dedicated endpoint: a composite response
 * that assembles its own payload is the one place where "I already checked
 * that somewhere else" is false.
 *
 * ⚠️ NOTHING INTERNAL LEAVES HERE. `_ownerEmail` and `_adminVerified` are
 * stripped by `sanitizeBundle`; the review `reason` and `decidedBy` are NOT
 * its business, so they are filtered here — the reason is written by an admin
 * about somebody's package and belongs to that owner alone.
 */
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  listAssets,
} = require('@calimero-network/registry-backend/src/lib/asset-store');
const {
  assetVisibility,
} = require('@calimero-network/registry-backend/src/lib/asset-visibility');
const {
  createBundleSanitizers,
} = require('@calimero-network/registry-backend/src/lib/bundle-sanitize');
const { kv } = require('#api-lib/kv-client');
const { resolveUser, canManagePackage } = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());
let sanitizers;
const getSanitizers = () => (sanitizers ??= createBundleSanitizers(kv));

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const pkg = req.query.package;
  if (!pkg) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'package required' });
  }

  try {
    const store = getStorage();
    const versions = await store.getBundleVersions(pkg);
    if (!versions?.length) {
      return res
        .status(404)
        .json({ error: 'not_found', message: `No such package: ${pkg}` });
    }
    const version = req.query.version || versions[0];
    const raw = await store.getBundleManifest(pkg, version);
    if (!raw) {
      return res
        .status(404)
        .json({ error: 'not_found', message: `No such version: ${version}` });
    }
    const bundle = await getSanitizers().sanitizeBundle(raw, pkg);

    // Anonymous is the common case: the user is resolved only to decide
    // whether a pending package's assets are visible to them, exactly as the
    // dedicated assets route does.
    const user = await resolveUser(req).catch(() => null);
    const admin = user?.email ? await isAdmin(user.email) : false;
    const owner = user ? await canManagePackage(pkg, raw, user) : false;
    const vis = await assetVisibility({ pkg, isOwner: owner, isAdmin: admin });

    const assets = vis.visible
      ? (await listAssets(pkg)).map(a => ({
          id: a.id,
          kind: a.kind,
          contentType: a.contentType,
          bytes: a.bytes,
          alt: a.alt,
          order: a.order,
          // Always an API path. A bucket URL would outlive every check that
          // gates it, and object names are guessable.
          url: `/api/v2/packages/${encodeURIComponent(pkg)}/assets/${a.id}/raw`,
        }))
      : [];

    return res.status(200).json({
      package: pkg,
      version,
      versions,
      metadata: bundle.metadata || {},
      verified: bundle.verified,
      bundle,
      assets,
      review: {
        state: vis.state,
        // Only the people entitled to it: the owner and admins. `visible`
        // is precisely that set.
        ...(vis.visible && vis.declineReason
          ? { declineReason: vis.declineReason }
          : {}),
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: 'package_read_failed', message: err.message });
  }
};
