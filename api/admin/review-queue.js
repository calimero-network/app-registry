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

    // ⚠️ PHASES, NOT A LOOP WITH FOUR AWAITS IN IT.
    //
    // This read the asset index, the review record, the version set and a
    // manifest one package at a time, each `await`ed inside a `for` — so a
    // registry of N packages cost up to 4N SERIALISED Redis round trips, and
    // the queue is the first screen an admin opens. Same property the bundle
    // listing already holds (tests/bundle-listing-batching.test.js): the
    // number of sequential round trips must not grow with the number of
    // packages. Commands issued in one tick are pipelined by node-redis, so
    // each `Promise.all` below is one wave.
    //
    // The phases narrow as they go — assets, then decision, then metadata —
    // so the expensive manifest reads only happen for packages that are
    // actually in the queue, which is normally a handful of the whole
    // registry.
    const assetsByPkg = await Promise.all(all.map(pkg => listAssets(pkg)));
    const withAssets = all
      .map((pkg, i) => ({ pkg, assets: assetsByPkg[i] }))
      .filter(entry => entry.assets.length > 0);

    const reviews = await Promise.all(
      withAssets.map(entry => review.getReview(entry.pkg))
    );

    const waitingEntries = withAssets
      .map((entry, i) => {
        const rec = reviews[i];
        // `uploadedAt`, the field `addAsset` actually writes. Assets stored
        // before it existed have none; they are treated as "uploaded at the
        // dawn of time", which puts them at the front of the queue rather
        // than hiding them from it.
        const newestAsset = entry.assets.reduce(
          (max, a) => (a.uploadedAt && a.uploadedAt > max ? a.uploadedAt : max),
          ''
        );
        // Undecided, or decided before the newest upload.
        const waiting =
          rec.state === 'pending' ||
          // Decided, then uploaded again — including a package that was
          // approved or declined months ago.
          (!!rec.decidedAt && newestAsset > rec.decidedAt) ||
          // Approved under the OLD boolean key, which recorded no date at
          // all. Those carry assets nobody reviewed under this system, so
          // they go in the queue once; declining is a decision and records a
          // date, which takes them out of it.
          (rec.legacy && rec.state === 'approved');
        return waiting ? { ...entry, rec, newestAsset } : null;
      })
      .filter(Boolean);

    // Versions for the queue members only, then their newest manifest.
    const versionSets = await Promise.all(
      waitingEntries.map(entry => kv.sMembers(`bundle-versions:${entry.pkg}`))
    );
    const latests = versionSets.map(versions =>
      versions.length
        ? versions.sort((a, b) =>
            semver.rcompare(
              semver.valid(a) || '0.0.0',
              semver.valid(b) || '0.0.0'
            )
          )[0]
        : null
    );
    const manifestRaws = await Promise.all(
      waitingEntries.map((entry, i) =>
        latests[i] ? kv.get(`bundle:${entry.pkg}/${latests[i]}`) : null
      )
    );

    const queue = [];
    waitingEntries.forEach((entry, i) => {
      const { pkg, assets, rec, newestAsset } = entry;
      const latest = latests[i];
      let metadata = {};
      const raw = manifestRaws[i];
      if (raw) {
        try {
          metadata = JSON.parse(raw).json?.metadata || {};
        } catch {
          // A corrupt manifest must not take the whole queue down with it —
          // the package still has pictures waiting on a decision.
          metadata = {};
        }
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
        assets: assets.map(a => {
          const base = `/api/v2/packages/${encodeURIComponent(pkg)}/assets/${a.id}/raw`;
          return {
            id: a.id,
            kind: a.kind,
            contentType: a.contentType,
            bytes: a.bytes,
            alt: a.alt,
            order: a.order,
            uploadedAt: a.uploadedAt || null,
            url: base,
            // The queue shows a row of tiles per package and there can be
            // eight per package: at the original size that is tens of
            // megabytes to render one screen of moderation decisions. The
            // moderator gets the full-resolution file on click instead.
            thumbUrl: a.thumbKey ? `${base}?variant=thumb` : base,
            width: a.width ?? null,
            height: a.height ?? null,
          };
        }),
      });
    });

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
