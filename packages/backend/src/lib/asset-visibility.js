'use strict';

/**
 * Who may see a package's assets.
 *
 * THE RULE: an asset is public only once an admin has explicitly approved the
 * package. Until then it is visible to the owner and to admins, and to nobody
 * else.
 *
 * ⚠️ THIS CANNOT KEY ON THE COMPUTED `verified` FLAG.
 * `verified` in bundle-sanitize.js resolves to true when the owner's email
 * ends in `@calimero.network` — it is a domain test, not a review. All 21
 * bundles in production are `verified: true`, including a test bundle
 * published by mistake. Gating on it would auto-approve everything and the
 * moderation gate would be decorative.
 *
 * The gate is the explicit `admin_verified:package:<pkg>` key, which is only
 * ever written by an admin action.
 *
 * ⚠️ DEFAULT DENY. A package with no decision recorded is PENDING, not
 * public. Getting this backwards publishes unreviewed images by default,
 * which is the entire thing this exists to prevent.
 *
 * ⚠️ PRIVATE MUST MEAN PRIVATE AT THE BYTES. Hiding a pending asset from the
 * API while its GCS object stays publicly readable is not moderation: object
 * names are guessable and the URL never expires. Assets are therefore always
 * served THROUGH the API (`/api/v2/packages/:pkg/assets/:id/raw`), which
 * applies this check on every read. Nothing ever hands out a bucket URL.
 */

const { kv } = require('./kv-client');

/** Has an admin explicitly approved this package? */
async function isPackageApproved(pkg) {
  return (await kv.get(`admin_verified:package:${pkg}`)) === '1';
}

/**
 * @param {object} opts
 * @param {string} opts.pkg
 * @param {boolean} opts.isOwner   caller owns the package (signer, owners[], or org)
 * @param {boolean} opts.isAdmin   caller is a site admin
 * @returns {Promise<{visible: boolean, state: 'approved'|'pending', reason: string}>}
 */
async function assetVisibility({ pkg, isOwner = false, isAdmin = false }) {
  const approved = await isPackageApproved(pkg);
  if (approved) {
    return { visible: true, state: 'approved', reason: 'package_approved' };
  }
  if (isAdmin) {
    return { visible: true, state: 'pending', reason: 'admin_review' };
  }
  if (isOwner) {
    return { visible: true, state: 'pending', reason: 'own_package' };
  }
  return { visible: false, state: 'pending', reason: 'awaiting_approval' };
}

module.exports = { assetVisibility, isPackageApproved };
