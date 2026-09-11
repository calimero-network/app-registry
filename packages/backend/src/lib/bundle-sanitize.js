/**
 * Shared bundle sanitization for the Fastify server and the Vercel bundle APIs.
 * Single source of truth: api/lib/bundle-sanitize.js used to be a hand-synced
 * copy of this file, and both are now served from here.
 * Strips internal metadata, normalizes min version fields, and computes the
 * TWO verification signals.
 *
 * ⚠️ `verified` AND `publisherVerified` ARE DIFFERENT CLAIMS, and they used to
 * be one field. The old `verified` was true when ANY of these held: an admin
 * had approved the package, the owner's email ended in `@calimero.network`,
 * or the owner's account was verified. Because every live publisher is on
 * `@calimero.network`, that made all 21 bundles verified — so the badge said
 * nothing and "show verified apps only" would have hidden nothing.
 *
 *   `verified`          — an admin approved THIS PACKAGE. Nothing else sets
 *                         it. A package can be verified whether or not its
 *                         publisher is, which is the whole point: the review
 *                         is of the package, its metadata and its pictures.
 *   `publisherVerified` — the person. Still the domain test for now, plus an
 *                         explicitly verified account. It decides the badge
 *                         next to the AUTHOR, and never the one on the
 *                         package.
 *
 * @param {object} kv - KV client with async get(key)
 */
/**
 * Re-expose the server-stamped fields under public names.
 *
 * `_installSize` and `_publishedAt` are written at push time and MUST keep the
 * underscore in storage: `removeTransientFields` in lib/verify.js drops
 * top-level `_`-prefixed keys before checking the signature, which is the only
 * reason the server may add fields to a signed manifest at all. Renaming them
 * here keeps that constraint out of the public API shape.
 *
 * Both are null for anything published before the policy shipped; the listing
 * must render that, not a zero.
 */
function exposeServerStamped(bundle) {
  return {
    installSize:
      typeof bundle._installSize === 'number' ? bundle._installSize : null,
    publishedAt:
      typeof bundle._publishedAt === 'string' ? bundle._publishedAt : null,
    // The callers spread `...bundle` first, so the storage-side spellings ride
    // along unless overridden here. Shipping both `_x` and `x` puts the
    // internal name in the public API and invites a consumer to read the one
    // that is not contractual. Setting them undefined leaves the keys present
    // on the object but drops them from JSON.stringify, which is the wire
    // contract Fastify serialises — asserted in bundle-sanitize.test.js.
    _installSize: undefined,
    _publishedAt: undefined,
  };
}

function createBundleSanitizers(kv, review) {
  // The sanitiser is constructed with a bare `kv` in four places, so the
  // review module is resolved here when it is not injected. Tests pass their
  // own; production gets the real one, bound to the same store.
  review = review || require('./package-review-for')(kv); // eslint-disable-line global-require

  /**
   * @param {object} bundle
   * @param {string} [packageName] - optional override for package id (admin_verified key)
   */
  async function sanitizeBundle(bundle, packageName) {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const raw =
      bundle.min_runtime_version ?? bundle.minRuntimeVersion ?? '0.1.0';
    const minRuntimeVersion =
      raw != null && String(raw).trim() ? String(raw).trim() : '0.1.0';

    const meta = bundle.metadata ? { ...bundle.metadata } : {};
    const ownerEmail = (meta._ownerEmail || '').toLowerCase();
    const hadAdminVerified = !!meta._adminVerified;
    delete meta._ownerEmail;
    delete meta._adminVerified;

    const pkg = packageName || bundle.package;

    // The package: an explicit decision, or the trusted-publisher default.
    // `_adminVerified` is the stamp the admin route writes onto the manifest
    // and the key is the same decision in KV.
    //
    // ⚠️ A DECLINE MUST WIN OVER THE SHORTCUT. `getReview` is the one place
    // that knows the order — explicit record, then legacy key, then trusted
    // publisher — so this asks it rather than re-deriving "is it approved"
    // from the parts and getting the precedence wrong.
    let verified = hadAdminVerified;
    if (!verified && pkg) {
      verified = await review.isApproved(pkg);
    }

    // The publisher. Independent: a package by an unverified publisher can be
    // verified, and a verified publisher's new package is not.
    let publisherVerified = ownerEmail.endsWith('@calimero.network');
    if (!publisherVerified && ownerEmail) {
      const userId = await kv.get(`email2user:${ownerEmail}`);
      if (userId) {
        const userRaw = await kv.get(`user:${userId}`);
        if (userRaw) {
          try {
            if (JSON.parse(userRaw).verified) publisherVerified = true;
          } catch {
            /* skip */
          }
        }
        if (!publisherVerified) {
          const adminVerified = await kv.get(`admin_verified:user:${userId}`);
          if (adminVerified === '1') publisherVerified = true;
        }
      }
    }

    return {
      ...bundle,
      metadata: meta,
      min_runtime_version: minRuntimeVersion,
      minRuntimeVersion,
      verified,
      publisherVerified,
      ...exposeServerStamped(bundle),
    };
  }

  /** Batch version for listings — 2 parallel Redis rounds instead of 4N sequential. */
  async function sanitizeBundles(rawItems) {
    const processed = rawItems.map(({ bundle, packageName }) => {
      const raw =
        bundle.min_runtime_version ?? bundle.minRuntimeVersion ?? '0.1.0';
      const minRuntimeVersion =
        raw != null && String(raw).trim() ? String(raw).trim() : '0.1.0';
      const meta = bundle.metadata ? { ...bundle.metadata } : {};
      const ownerEmail = (meta._ownerEmail || '').toLowerCase();
      const hadAdminVerified = !!meta._adminVerified;
      delete meta._ownerEmail;
      delete meta._adminVerified;
      return {
        bundle,
        packageName,
        meta,
        ownerEmail,
        hadAdminVerified,
        minRuntimeVersion,
      };
    });

    const uniquePackages = [
      ...new Set(
        processed.map(p => p.packageName || p.bundle.package).filter(Boolean)
      ),
    ];
    const uniqueEmails = [
      ...new Set(
        processed
          .map(p => p.ownerEmail)
          .filter(e => e && !e.endsWith('@calimero.network'))
      ),
    ];
    // ⚠️ `isApproved`, NOT the raw key. The batch path used to read
    // `admin_verified:package:*` directly, which skips both the newer
    // `pkg-review` record AND the trusted-publisher default — so the listing
    // would disagree with the app page about the very same package.
    const [pkgApprovedVals, userIdVals] = await Promise.all([
      Promise.all(uniquePackages.map(p => review.isApproved(p))),
      Promise.all(uniqueEmails.map(e => kv.get(`email2user:${e}`))),
    ]);
    const pkgApprovedMap = Object.fromEntries(
      uniquePackages.map((p, i) => [p, pkgApprovedVals[i]])
    );
    const emailToUserId = Object.fromEntries(
      uniqueEmails.map((e, i) => [e, userIdVals[i]])
    );

    const uniqueUserIds = [
      ...new Set(Object.values(emailToUserId).filter(Boolean)),
    ];
    const [userVals, userAdminVerifiedVals] = uniqueUserIds.length
      ? await Promise.all([
          Promise.all(uniqueUserIds.map(id => kv.get(`user:${id}`))),
          Promise.all(
            uniqueUserIds.map(id => kv.get(`admin_verified:user:${id}`))
          ),
        ])
      : [[], []];
    const userMap = Object.fromEntries(
      uniqueUserIds.map((id, i) => {
        try {
          return [id, userVals[i] ? JSON.parse(userVals[i]) : null];
        } catch {
          return [id, null];
        }
      })
    );
    const userAdminVerifiedMap = Object.fromEntries(
      uniqueUserIds.map((id, i) => [id, userAdminVerifiedVals[i] === '1'])
    );

    return processed.map(
      ({
        bundle,
        packageName,
        meta,
        ownerEmail,
        hadAdminVerified,
        minRuntimeVersion,
      }) => {
        const pkg = packageName || bundle.package;
        // ⚠️ The same two rules as the single path, and they must stay the
        // same two: bundle-listing-parity.test.js exists because these
        // diverged once already.
        let verified = hadAdminVerified;
        if (!verified && pkgApprovedMap[pkg]) verified = true;

        let publisherVerified = ownerEmail.endsWith('@calimero.network');
        if (!publisherVerified && ownerEmail) {
          const userId = emailToUserId[ownerEmail];
          if (userId) {
            if (userMap[userId]?.verified) publisherVerified = true;
            if (!publisherVerified && userAdminVerifiedMap[userId])
              publisherVerified = true;
          }
        }
        return {
          ...bundle,
          metadata: meta,
          min_runtime_version: minRuntimeVersion,
          minRuntimeVersion,
          verified,
          publisherVerified,
          ...exposeServerStamped(bundle),
        };
      }
    );
  }

  return { sanitizeBundle, sanitizeBundles };
}

module.exports = { createBundleSanitizers };
