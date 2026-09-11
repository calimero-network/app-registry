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

const review = require('./package-review');

/**
 * Has an admin explicitly approved this package?
 *
 * ⚠️ NOW THREE STATES, NOT A BOOLEAN. `declined` hides assets exactly as
 * `pending` does, so every caller must ask for `approved` — a check written
 * as "not pending" would make declining a package publish it. The review
 * module still reads the old `admin_verified:package:<pkg>` key, so the 21
 * packages approved before this existed stay approved.
 */
async function isPackageApproved(pkg) {
  return review.isApproved(pkg);
}

/**
 * @param {object} opts
 * @param {string} opts.pkg
 * @param {boolean} opts.isOwner   caller owns the package (signer, owners[], or org)
 * @param {boolean} opts.isAdmin   caller is a site admin
 * @returns {Promise<{visible: boolean, state: 'approved'|'pending', reason: string}>}
 */
async function assetVisibility({ pkg, isOwner = false, isAdmin = false }) {
  const rec = await review.getReview(pkg);
  if (rec.state === 'approved') {
    return { visible: true, state: 'approved', reason: 'package_approved' };
  }
  // Pending and declined are the same to a stranger. They differ for the
  // owner, who is told which one it is and why, and for the queue, which a
  // declined package has left.
  if (isAdmin) {
    return { visible: true, state: rec.state, reason: 'admin_review' };
  }
  if (isOwner) {
    return {
      visible: true,
      state: rec.state,
      reason: rec.state === 'declined' ? 'declined' : 'own_package',
      // ⚠️ The reason is the OWNER's to read, and nobody else's. It is
      // written by an admin about their package and must never appear in a
      // public response.
      declineReason: rec.state === 'declined' ? rec.reason : undefined,
    };
  }
  return { visible: false, state: rec.state, reason: 'awaiting_approval' };
}

module.exports = { assetVisibility, isPackageApproved };
