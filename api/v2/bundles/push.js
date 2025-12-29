/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 *
 * Temporary: Unauthenticated first-come-first-serve with signature verification
 *
 * Accepts:
 * - multipart/form-data with .mpk file
 * OR
 * - JSON with bundle manifest
 *
 * Validates:
 * 1. Bundle manifest structure
 * 2. Signature verification (if present)
 * 3. First-come-first-serve (package@version must not exist)
 */

const {
  BundleStorageKV,
} = require('../../../packages/backend/src/lib/bundle-storage-kv');

// Dynamic import for Ed25519
let ed25519;

/**
 * Recursively sort object keys for canonicalization
 * Exported for testing
 */
function sortKeysRecursively(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }

  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = sortKeysRecursively(obj[key]);
    });
  return sorted;
}

/**
 * Canonicalize JSON for signature verification
 */
function canonicalizeJSON(obj) {
  return JSON.stringify(sortKeysRecursively(obj));
}

/**
 * Validate bundle manifest structure
 */
function validateBundleManifest(manifest) {
  const errors = [];

  if (!manifest) {
    errors.push('Missing manifest');
    return { valid: false, errors };
  }

  if (!manifest.version || manifest.version !== '1.0') {
    errors.push('Invalid or missing version (must be "1.0")');
  }

  if (!manifest.package || typeof manifest.package !== 'string') {
    errors.push('Missing or invalid package name');
  }

  if (!manifest.appVersion || typeof manifest.appVersion !== 'string') {
    errors.push('Missing or invalid appVersion');
  }

  if (!manifest.metadata || typeof manifest.metadata !== 'object') {
    errors.push('Missing or invalid metadata object');
  } else {
    if (!manifest.metadata.name || typeof manifest.metadata.name !== 'string') {
      errors.push('Missing or invalid metadata.name');
    }
    if (
      !manifest.metadata.description ||
      typeof manifest.metadata.description !== 'string'
    ) {
      errors.push('Missing or invalid metadata.description');
    }
    if (
      !manifest.metadata.author ||
      typeof manifest.metadata.author !== 'string'
    ) {
      errors.push('Missing or invalid metadata.author');
    }
  }

  if (!manifest.wasm || typeof manifest.wasm !== 'object') {
    errors.push('Missing or invalid wasm object');
  } else {
    if (!manifest.wasm.path || typeof manifest.wasm.path !== 'string') {
      errors.push('Missing or invalid wasm.path');
    }
    if (!manifest.wasm.hash || typeof manifest.wasm.hash !== 'string') {
      errors.push('Missing or invalid wasm.hash');
    }
    if (typeof manifest.wasm.size !== 'number' || manifest.wasm.size <= 0) {
      errors.push('Missing or invalid wasm.size');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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

    const canonical = canonicalizeJSON({
      version: manifest.version,
      package: manifest.package,
      appVersion: manifest.appVersion,
      metadata: manifest.metadata,
      wasm: manifest.wasm,
      interfaces: manifest.interfaces || null,
      migrations: manifest.migrations || null,
      links: manifest.links || null,
    });

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

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

// Export the main handler
const handler = async (req, res) => {
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const store = getStorage();
    let bundleManifest;

    // Check if this is multipart/form-data (file upload)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return res.status(501).json({
        error: 'not_implemented',
        message: 'File upload not yet implemented for Vercel deployment',
      });
    }

    // Handle JSON payload
    try {
      bundleManifest = req.body;
    } catch (error) {
      return res.status(400).json({
        error: 'invalid_json',
        message: 'Request body must be valid JSON',
      });
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
    await store.storeBundleManifest(bundleManifest);

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('Error publishing bundle:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to publish bundle',
    });
  }
};

module.exports = handler;
