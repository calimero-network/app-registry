/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

const {
  BundleStorageKV,
} = require('../../../packages/backend/src/lib/bundle-storage-kv');
const { verifyManifest } = require('../../../packages/backend/src/lib/verify');

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

    // Verify signature if present (signatures are optional but must be valid if provided)
    if (bundleManifest.signature) {
      try {
        verifyManifest(bundleManifest);
      } catch (error) {
        return res.status(400).json({
          error: 'invalid_signature',
          message: error.message || 'Signature verification failed',
        });
      }
    }

    const overwrite = bundleManifest._overwrite === true;

    // Store the bundle
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
