/**
 * V2 Bundle Listing API
 * GET /api/v2/bundles
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const { kv } = require('@calimero-network/registry-backend/src/lib/kv-client');
const { createBundleSanitizers } = require('../../lib/bundle-sanitize');

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
 * invoking the function at all. `stale-while-revalidate` keeps the once-a-minute
 * refresh off the user's critical path, so a newly pushed bundle shows up within
 * ~60s while nobody ever waits on a cold read.
 *
 * Only ever set on 2xx — a cached 404/500 would outlive the condition.
 */
function sendCached(res, payload) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=86400'
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
  const { sanitizeBundle, sanitizeBundles } = createBundleSanitizers(kv);

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
      return sendCached(res, [{ ...sanitized, downloads }]);
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
    const wantAllVersions = all_versions === 'true' && !!pkg;
    const entries = await store.listBundleManifests({
      package: pkg || null,
      allVersions: wantAllVersions,
      includeYanked: wantAllVersions,
    });

    const rawBundles = [];
    for (const { packageName, bundle, yanked } of entries) {
      if (wantAllVersions) {
        rawBundles.push({ bundle: { ...bundle, yanked }, packageName });
        continue;
      }
      if (developer && bundle.signature?.pubkey !== developer) continue;
      if (author) {
        const authorIdentity =
          bundle.metadata?.author ?? bundle.metadata?._ownerEmail;
        if (authorIdentity !== author) continue;
      }
      rawBundles.push({ bundle, packageName });
    }

    // Batch-sanitize all bundles and batch-fetch download counts in parallel
    const uniquePackages = [...new Set(rawBundles.map(b => b.packageName))];
    const [sanitized, downloadVals] = await Promise.all([
      sanitizeBundles(rawBundles),
      Promise.all(
        uniquePackages.map(p => kv.get(`downloads:${p.toLowerCase()}`))
      ),
    ]);
    const countByPackage = Object.fromEntries(
      uniquePackages.map((p, i) => [
        p,
        downloadVals[i] ? parseInt(downloadVals[i], 10) : 0,
      ])
    );
    const bundles = sanitized.map((s, i) => ({
      ...s,
      downloads: countByPackage[rawBundles[i].packageName] ?? 0,
    }));

    // Stable sort, so the version-descending order within a package survives.
    bundles.sort((a, b) => a.package.localeCompare(b.package));
    return sendCached(res, bundles);
  } catch (error) {
    console.error('List Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
