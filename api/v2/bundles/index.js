/**
 * V2 Bundle Listing API
 * GET /api/v2/bundles
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const { kv } = require('@calimero-network/registry-backend/src/lib/kv-client');
const {
  createBundleSanitizers,
} = require('@calimero-network/registry-backend/src/lib/bundle-sanitize');
const {
  buildBundleListing,
} = require('@calimero-network/registry-backend/src/lib/bundle-listing');

// Singleton storage instance (shared Redis connection with the sibling bundle
// endpoints — this handler used to open a second one of its own).
let storage;
function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

/**
 * Listings are derived purely from published bundles — no auth is read and
 * nothing is mutated — so they are safe to cache publicly at the CDN. This is
 * what makes the endpoint feel instant: Vercel serves it from the edge without
 * invoking the function at all.
 *
 * Nothing invalidates that cache, so these two numbers are not a perf knob —
 * they ARE the correctness budget for every mutation (publish, yank, delete
 * version, delete package). Whatever they add up to is how long a deleted
 * package keeps appearing in browse. They were `s-maxage=60,
 * stale-while-revalidate=86400`, which put that budget at a day per edge
 * region: a package deleted through an API that cleans up correctly still
 * showed on the site long enough to read as a failed delete.
 *
 * `max-age=0` is explicit because the omission was the other half of the bug —
 * with no browser directive at all, `stale-while-revalidate` also let the
 * browser reuse its own copy for that day.
 */
const EDGE_FRESH_SECONDS = 30;
const EDGE_STALE_SECONDS = 30;

/**
 * A read that has to reflect a write that just happened — the tab that issued
 * the delete asking again, or a publish job reading back the latest version —
 * passes `?fresh=1`.
 */
function wantsFresh(query) {
  const value = query?.fresh;
  return value === '1' || value === 'true';
}

/**
 * Only ever called on 2xx — a cached 404/500 would outlive the condition.
 *
 * `no-store` for a fresh read keeps the edge out of the way in both directions:
 * the function always runs, and that one-off answer never lands in the shared
 * cache where the next visitor would inherit it.
 */
function sendCached(res, payload, { fresh } = {}) {
  res.setHeader(
    'Cache-Control',
    fresh
      ? 'no-store'
      : `public, max-age=0, s-maxage=${EDGE_FRESH_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`
  );
  return res.status(200).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const store = getStorage();
  const { sanitizeBundle } = createBundleSanitizers(kv);
  const fresh = wantsFresh(req.query);

  try {
    const { package: pkg, version, developer, author } = req.query || {};

    if (pkg && version) {
      const raw = await store.getBundleManifest(pkg, version);
      if (!raw) return res.status(404).json({ error: 'not_found' });
      const downloadCount = await kv.get(
        `downloads:${(pkg || '').toLowerCase()}`
      );
      const downloads = downloadCount ? parseInt(downloadCount, 10) : 0;
      const sanitized = await sanitizeBundle(raw, pkg);
      return sendCached(res, [{ ...sanitized, downloads }], { fresh });
    }

    const { all_versions } = req.query || {};

    if (all_versions === 'true' && !pkg) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'all_versions requires a package parameter',
      });
    }
    if (all_versions === 'true' && (developer || author)) {
      return res.status(400).json({
        error: 'invalid_params',
        message:
          'all_versions cannot be combined with developer or author filters',
      });
    }

    // Every version (for the version picker) or just the latest per package
    // (for the browse/list views), in a fixed 3 Redis round trips either way.
    // yanked is stored separately at bundle-yanked:<pkg>/<ver> so it can be
    // toggled without touching the immutable bundle manifest.
    //
    // NOTE: `?package=X` alone returns the LATEST version here, while the
    // Fastify copy (packages/backend/src/server.js) returns every version for
    // the same query and ignores all_versions entirely. That difference
    // pre-dates the batching work and is deliberately preserved — changing it
    // either way is an API decision affecting the frontend and CLI. Both
    // behaviours are pinned in tests/bundle-listing-parity.test.js.
    const wantAllVersions = all_versions === 'true' && !!pkg;
    const entries = await store.listBundleManifests({
      package: pkg || null,
      allVersions: wantAllVersions,
      includeYanked: wantAllVersions,
    });

    // Filtering, sanitization, download counts and ordering are shared with
    // the Fastify copy, so the two cannot disagree on how a listing entry is
    // built. They still differ on which versions they select — see above.
    const bundles = await buildBundleListing({
      entries,
      kv,
      developer,
      author,
    });
    return sendCached(res, bundles, { fresh });
  } catch (error) {
    console.error('List Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
