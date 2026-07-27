/**
 * Shared post-processing for the bundle listing endpoints.
 *
 * GET /api/v2/bundles is implemented twice — once as a Vercel function
 * (api/v2/bundles/index.js, the deployed one) and once on the Fastify server
 * (packages/backend/src/server.js, used for Docker/self-hosted). Those copies
 * had already drifted into two separate serial Redis loops, which is how the
 * ~9.6s listing shipped unnoticed.
 *
 * BundleStorageKV#listBundleManifests consolidates the *fetching*; this module
 * consolidates everything that happens after it — filtering, sanitization,
 * download counts and ordering — so the two endpoints cannot disagree about
 * what a listing entry looks like.
 *
 * The endpoints still own their own request/response concerns (query
 * validation, status codes, cache headers, and whether they expose
 * `all_versions`), which is where they legitimately differ.
 */

const { createBundleSanitizers } = require('./bundle-sanitize');

/** Redis counters are plain integers; tolerate anything legacy or absent. */
function toCount(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Turn raw manifests into the public listing payload.
 *
 * @param {object}   opts
 * @param {Array}    opts.entries    From BundleStorageKV#listBundleManifests:
 *                                   `{packageName, version, bundle, yanked?}`.
 *                                   A present `yanked` is merged into the
 *                                   bundle, so callers that did not ask for it
 *                                   never grow the field.
 * @param {object}   opts.kv         KV client with async get(key).
 * @param {string}   [opts.developer] Filter on signature.pubkey.
 * @param {string}   [opts.author]    Filter on metadata.author, falling back to
 *                                    metadata._ownerEmail for legacy bundles.
 * @returns {Promise<Array<object>>} Sanitized bundles with `downloads`, sorted
 *          by package name. The sort is stable, so version-descending order
 *          within a package survives.
 */
async function buildBundleListing({ entries, kv, developer, author }) {
  const { sanitizeBundles } = createBundleSanitizers(kv);

  const selected = [];
  for (const { packageName, bundle, yanked } of entries) {
    if (developer) {
      const pubkey = bundle.signature?.pubkey;
      if (!pubkey || pubkey !== developer) continue;
    }
    if (author) {
      const identity = bundle.metadata?.author ?? bundle.metadata?._ownerEmail;
      if (!identity || identity !== author) continue;
    }
    selected.push({
      bundle: yanked === undefined ? bundle : { ...bundle, yanked },
      packageName,
    });
  }

  // Both fan-outs are issued in the same tick, so node-redis pipelines them
  // into a single round trip rather than one per bundle.
  const uniquePackages = [...new Set(selected.map(b => b.packageName))];
  const [sanitized, downloadVals] = await Promise.all([
    sanitizeBundles(selected),
    Promise.all(
      uniquePackages.map(p => kv.get(`downloads:${p.toLowerCase()}`))
    ),
  ]);

  const countByPackage = Object.fromEntries(
    uniquePackages.map((p, i) => [p, toCount(downloadVals[i])])
  );

  const bundles = sanitized.map((s, i) => ({
    ...s,
    downloads: countByPackage[selected[i].packageName] ?? 0,
  }));

  bundles.sort((a, b) => a.package.localeCompare(b.package));
  return bundles;
}

module.exports = { buildBundleListing };
