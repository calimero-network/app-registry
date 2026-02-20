/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 * Requires signature; verifies and enforces package ownership (same key as existing versions).
 */

const {
  BundleStorageKV,
} = require('../../../packages/backend/src/lib/bundle-storage-kv');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  isAllowedOwner,
  normalizeSignature,
} = require('../../../packages/backend/src/lib/verify');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const store = getStorage();
    const bundleManifest = req.body;

    if (
      !bundleManifest ||
      bundleManifest === null ||
      bundleManifest === undefined
    ) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing body',
      });
    }

    if (!bundleManifest?.package || !bundleManifest?.appVersion) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing required fields: package, appVersion',
      });
    }

    // Require signature for all publishes
    const sig = normalizeSignature(bundleManifest?.signature);
    if (!sig) {
      return res.status(400).json({
        error: 'missing_signature',
        message:
          'Missing signature. All publishes require a valid signature (algorithm, publicKey, signature).',
      });
    }

    try {
      await verifyManifest(bundleManifest);
    } catch (err) {
      return res.status(400).json({
        error: 'invalid_signature',
        message: err.message || 'Signature verification failed',
      });
    }

    // Ownership: same package must be published by the same key or by a key in owners[]
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await store.getBundleVersions(bundleManifest.package);
    if (versions.length > 0) {
      const existingManifest = await store.getBundleManifest(
        bundleManifest.package,
        versions[0]
      );
      if (!isAllowedOwner(existingManifest, incomingKey)) {
        return res.status(403).json({
          error: 'not_owner',
          message:
            'Package name is already registered to a different key; you are not the owner.',
        });
      }
    }

    // Never trust client-controlled _overwrite; only allow overwrite when server config enables it (e.g. migrations).
    const overwrite =
      process.env.ALLOW_BUNDLE_OVERWRITE === 'true' ||
      process.env.ALLOW_BUNDLE_OVERWRITE === '1';

    await store.storeBundleManifest(bundleManifest, overwrite);

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
