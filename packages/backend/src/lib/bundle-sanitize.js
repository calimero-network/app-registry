/**
 * Shared bundle sanitization for the Fastify server and the Vercel bundle APIs.
 * Single source of truth: api/lib/bundle-sanitize.js used to be a hand-synced
 * copy of this file, and both are now served from here.
 * Strips internal metadata, normalizes min version fields, computes `verified`.
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
  };
}

function createBundleSanitizers(kv) {
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

    let verified = hadAdminVerified;
    const pkg = packageName || bundle.package;

    if (!verified && pkg) {
      const pkgKey = await kv.get(`admin_verified:package:${pkg}`);
      if (pkgKey === '1') verified = true;
    }
    if (!verified && ownerEmail.endsWith('@calimero.network')) {
      verified = true;
    }
    if (!verified && ownerEmail) {
      const userId = await kv.get(`email2user:${ownerEmail}`);
      if (userId) {
        const userRaw = await kv.get(`user:${userId}`);
        if (userRaw) {
          try {
            const user = JSON.parse(userRaw);
            if (user.verified) verified = true;
          } catch {
            /* skip */
          }
        }
        if (!verified) {
          const adminVerified = await kv.get(`admin_verified:user:${userId}`);
          if (adminVerified === '1') verified = true;
        }
      }
    }

    return {
      ...bundle,
      metadata: meta,
      min_runtime_version: minRuntimeVersion,
      minRuntimeVersion,
      verified,
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
    const [pkgVerifiedVals, userIdVals] = await Promise.all([
      Promise.all(
        uniquePackages.map(p => kv.get(`admin_verified:package:${p}`))
      ),
      Promise.all(uniqueEmails.map(e => kv.get(`email2user:${e}`))),
    ]);
    const pkgVerifiedMap = Object.fromEntries(
      uniquePackages.map((p, i) => [p, pkgVerifiedVals[i] === '1'])
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
        let verified = hadAdminVerified;
        const pkg = packageName || bundle.package;
        if (!verified && pkgVerifiedMap[pkg]) verified = true;
        if (!verified && ownerEmail.endsWith('@calimero.network'))
          verified = true;
        if (!verified && ownerEmail) {
          const userId = emailToUserId[ownerEmail];
          if (userId) {
            if (userMap[userId]?.verified) verified = true;
            if (!verified && userAdminVerifiedMap[userId]) verified = true;
          }
        }
        return {
          ...bundle,
          metadata: meta,
          min_runtime_version: minRuntimeVersion,
          minRuntimeVersion,
          verified,
          ...exposeServerStamped(bundle),
        };
      }
    );
  }

  return { sanitizeBundle, sanitizeBundles };
}

module.exports = { createBundleSanitizers };
