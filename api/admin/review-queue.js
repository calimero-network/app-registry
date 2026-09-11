/**
 * GET /api/admin/review-queue — packages whose assets are waiting on a
 * decision.
 *
 * The admin page used to list every package flat with a Verify toggle, which
 * answered the wrong question: an admin moderating uploads needs to know
 * which packages have pictures nobody has looked at, and needs to see the
 * pictures.
 *
 * ⚠️ A PACKAGE IS IN THE QUEUE BECAUSE OF ITS ASSETS, NOT ITS STATE. A
 * package approved last month that uploaded a new screenshot this morning is
 * waiting again — the decision is about the images, and the newest one
 * postdating the decision is exactly what "unreviewed" means. Keying on
 * `state === 'pending'` alone would let anyone publish anything after their
 * first approval by uploading afterwards.
 *
 * ⚠️ A PACKAGE WITH NO ASSETS IS NOT IN THE QUEUE. Most of the registry has
 * never uploaded an image; listing all of them buries the handful that need
 * attention, which is the failure mode of the screen this replaces.
 */
const { requireAdmin } = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const semver = require('semver');
const review = require('#api-lib/package-review');
const {
  listAssets,
} = require('@calimero-network/registry-backend/src/lib/asset-store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const all = await kv.sMembers('bundles:all');
    const queue = [];

    for (const pkg of all) {
      const assets = await listAssets(pkg);
      if (!assets.length) continue;

      const rec = await review.getReview(pkg);
      // `uploadedAt`, the field `addAsset` actually writes. Assets stored
      // before it existed have none; they are treated as "uploaded at the
      // dawn of time", which puts them at the front of the queue rather than
      // hiding them from it.
      const newestAsset = assets.reduce(
        (max, a) => (a.uploadedAt && a.uploadedAt > max ? a.uploadedAt : max),
        ''
      );
      // Undecided, or decided before the newest upload.
      const waiting =
        rec.state === 'pending' ||
        // Decided, then uploaded again — including a package that was
        // approved or declined months ago.
        (!!rec.decidedAt && newestAsset > rec.decidedAt) ||
        // Approved under the OLD boolean key, which recorded no date at all.
        // Those carry assets nobody reviewed under this system, so they go in
        // the queue once; declining is a decision and records a date, which
        // takes them out of it.
        (rec.legacy && rec.state === 'approved');
      if (!waiting) continue;

      const versions = await kv.sMembers(`bundle-versions:${pkg}`);
      const latest = versions.length
        ? versions.sort((a, b) =>
            semver.rcompare(
              semver.valid(a) || '0.0.0',
              semver.valid(b) || '0.0.0'
            )
          )[0]
        : null;
      let metadata = {};
      if (latest) {
        const raw = await kv.get(`bundle:${pkg}/${latest}`);
        if (raw) metadata = JSON.parse(raw).json?.metadata || {};
      }

      queue.push({
        package: pkg,
        latestVersion: latest,
        // ⚠️ `_`-prefixed keys are internal (`_ownerEmail`, `_adminVerified`).
        // This response goes to an admin, but the same shape gets copied into
        // public handlers, so the sanitising happens here rather than being
        // remembered later.
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(([k]) => !k.startsWith('_'))
        ),
        author: metadata.author || '',
        state: rec.state,
        decidedAt: rec.decidedAt,
        decidedBy: rec.decidedBy,
        reason: rec.reason,
        newestAssetAt: newestAsset || null,
        assets: assets.map(a => ({
          id: a.id,
          kind: a.kind,
          contentType: a.contentType,
          bytes: a.bytes,
          alt: a.alt,
          order: a.order,
          uploadedAt: a.uploadedAt || null,
          url: `/api/v2/packages/${encodeURIComponent(pkg)}/assets/${a.id}/raw`,
        })),
      });
    }

    // Longest wait first: the oldest unreviewed upload is the one someone is
    // sitting waiting on.
    queue.sort((a, b) =>
      String(a.newestAssetAt).localeCompare(String(b.newestAssetAt))
    );
    return res.status(200).json({ queue, count: queue.length });
  } catch (err) {
    return res
      .status(500)
      .json({ error: 'queue_failed', message: err.message });
  }
};
