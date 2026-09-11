/**
 * A package's moderation decision.
 *
 * Shared by the Vercel serverless routes and the Fastify backend, the same
 * way `admin-storage.js` is, so there is exactly one definition of what
 * "approved" means. Both runtimes serve the same data; two copies of this
 * rule would be two different registries.
 *
 * ⚠️ THIS REPLACES A BOOLEAN, AND THE BOOLEAN IS STILL IN PRODUCTION.
 * Approval used to be `admin_verified:package:<pkg> = '1'`, which cannot tell
 * "reviewed and rejected" from "never looked at" — so a declined package
 * returned to the review queue forever and its owner was never told why.
 * Reads therefore fall back to that key and treat `'1'` as approved: 21
 * packages are live and a reader that ignored it would un-approve every one
 * of them at the moment of deploy.
 *
 * ⚠️ DEFAULT DENY, AND IT SURVIVES THE MIGRATION. No record and no legacy key
 * means PENDING. This is the one place in the codebase where getting a
 * default backwards publishes unreviewed images, so the fallback chain ends
 * in 'pending' and never in 'approved'.
 *
 * ⚠️ `declined` HIDES ASSETS EXACTLY AS `pending` DOES. The difference is not
 * visibility — it is that a declined package is out of the queue and carries
 * a reason its owner can read. Anything that asks "can this be seen" must ask
 * for `approved`, never "not pending".
 */

const STATES = ['pending', 'approved', 'declined'];

const reviewKey = pkg => `pkg-review:${pkg}`;
const legacyKey = pkg => `admin_verified:package:${pkg}`;
/** Packages that have ever been decided, so the queue does not scan every key. */
const DECIDED_SET = 'pkg-review:decided';

function createPackageReview(kv) {
  /**
   * @returns {Promise<{state: 'pending'|'approved'|'declined', decidedBy: string|null,
   *                    decidedAt: string|null, reason: string, legacy: boolean}>}
   */
  async function getReview(pkg) {
    const raw = await kv.get(reviewKey(pkg));
    if (raw) {
      try {
        const rec = JSON.parse(raw);
        if (STATES.includes(rec?.state)) {
          return {
            state: rec.state,
            decidedBy: rec.decidedBy ?? null,
            decidedAt: rec.decidedAt ?? null,
            reason: rec.reason ?? '',
            legacy: false,
          };
        }
      } catch {
        // A corrupt record is not an approval. Fall through to the legacy
        // key and then to pending.
      }
    }

    if ((await kv.get(legacyKey(pkg))) === '1') {
      return {
        state: 'approved',
        decidedBy: null,
        decidedAt: null,
        reason: '',
        legacy: true,
      };
    }

    return {
      state: 'pending',
      decidedBy: null,
      decidedAt: null,
      reason: '',
      legacy: false,
    };
  }

  /**
   * Record a decision. `by` is the admin's email, kept for the audit trail —
   * ⚠️ it is NEVER part of a public response.
   */
  async function setReview(pkg, { state, by = null, reason = '' } = {}) {
    if (!STATES.includes(state)) {
      throw new Error(`unknown review state: ${state}`);
    }
    const record = {
      state,
      decidedBy: by,
      decidedAt: new Date().toISOString(),
      reason: String(reason || '').slice(0, 500),
    };
    await kv.set(reviewKey(pkg), JSON.stringify(record));

    // The legacy key is kept in step rather than deleted: `verified` badges,
    // the admin listing and any consumer still reading it would all flip at
    // once otherwise, and this is a live registry.
    if (state === 'approved') {
      await kv.set(legacyKey(pkg), '1');
    } else {
      await kv.del(legacyKey(pkg));
    }

    await kv.sAdd?.(DECIDED_SET, pkg);
    return record;
  }

  async function isApproved(pkg) {
    return (await getReview(pkg)).state === 'approved';
  }

  /** Every package with a recorded decision, for the admin queue's bookkeeping. */
  async function decidedPackages() {
    const members = await kv.sMembers?.(DECIDED_SET);
    return Array.isArray(members) ? members : [];
  }

  return { getReview, setReview, isApproved, decidedPackages, STATES };
}

module.exports = {
  createPackageReview,
  reviewKey,
  legacyKey,
  DECIDED_SET,
  STATES,
};
