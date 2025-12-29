/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

const {
  canonicalizeBundle,
  validateBundleManifest,
} = require('../../../packages/backend/src/lib/v2-utils');

// Dynamic import for dependencies
let BundleStorageKV;
let ed25519;

function getStorage() {
  if (!BundleStorageKV) {
    ({
      BundleStorageKV,
    } = require('../../../packages/backend/src/lib/bundle-storage-kv'));
  }
  return new BundleStorageKV();
}

/**
 * Verify signature (optional - allows unsigned bundles for testing)
 */
async function verifySignature(manifest, signature) {
  if (!signature) {
    return true; // Allow unsigned bundles
  }

  try {
    if (!ed25519) {
      ed25519 = await import('@noble/ed25519');
    }

    const canonical = canonicalizeBundle(manifest);
    const message = new TextEncoder().encode(canonical);
    const signatureBytes = new Uint8Array(Buffer.from(signature.sig, 'hex'));
    const pubkeyBytes = new Uint8Array(
      Buffer.from(signature.pubkey.replace('ed25519:', ''), 'hex')
    );

    return await ed25519.verify(signatureBytes, message, pubkeyBytes);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// The main handler
module.exports = async (req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }

  // Set CORS headers for all other requests
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const store = getStorage();
    let bundleManifest = req.body;

    if (!bundleManifest) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Bundle manifest validation failed',
        details: ['Missing manifest body'],
      });
    }

    const overwrite = bundleManifest._overwrite === true;

    // Check if binary is attached (as hex)
    if (bundleManifest._binary) {
      const binarySize = bundleManifest._binary.length / 2;
      console.log(`📦 Bundle push includes binary: ${binarySize} bytes`);
    }

    // Validate manifest structure
    const validation = validateBundleManifest(bundleManifest);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Bundle manifest validation failed',
        details: validation.errors,
      });
    }

    // Check if bundle already exists (first-come-first-serve)
    if (!overwrite) {
      const existing = await store.getBundleManifest(
        bundleManifest.package,
        bundleManifest.appVersion
      );
      if (existing) {
        return res.status(409).json({
          error: 'bundle_exists',
          message: `Bundle ${bundleManifest.package}@${bundleManifest.appVersion} already exists`,
        });
      }
    }

    // Verify signature if present
    if (bundleManifest.signature) {
      const signatureValid = await verifySignature(
        bundleManifest,
        bundleManifest.signature
      );
      if (!signatureValid) {
        return res.status(400).json({
          error: 'invalid_signature',
          message: 'Bundle signature verification failed',
        });
      }
    }

    // Store the bundle
    await store.storeBundleManifest(bundleManifest, overwrite);

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('CRITICAL: Serverless function crash:', error);
    return res.status(500).json({
      error: 'function_crash',
      message: error.message,
    });
  }
};
