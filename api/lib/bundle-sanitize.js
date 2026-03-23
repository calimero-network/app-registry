/**
 * Shared bundle sanitization for Vercel bundle APIs.
 * Strips internal metadata, normalizes min version fields, computes `verified`.
 *
 * @param {object} kv - KV client with async get(key)
 */
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
        };
      }
    );
  }

  return { sanitizeBundle, sanitizeBundles };
}

module.exports = { createBundleSanitizers };
