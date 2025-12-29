/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

// Helper: Recursively sort object keys for canonicalization
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

// Helper: Canonicalize JSON
function canonicalizeJSON(obj) {
  return JSON.stringify(sortKeysRecursively(obj));
}

// Helper: Canonicalize bundle for signature verification
function canonicalizeBundle(manifest) {
  const manifestJson = { ...manifest };
  delete manifestJson.signature;
  delete manifestJson._binary;
  delete manifestJson._overwrite;

  return canonicalizeJSON({
    version: manifestJson.version,
    package: manifestJson.package,
    appVersion: manifestJson.appVersion,
    metadata: manifestJson.metadata,
    wasm: manifestJson.wasm,
    interfaces: manifestJson.interfaces || null,
    migrations: manifestJson.migrations || null,
    links: manifestJson.links || null,
  });
}

// Helper: Validate bundle manifest structure
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
  return { valid: errors.length === 0, errors };
}

// Dependency placeholders
let BundleStorageKV;
let ed25519;

// The Vercel Serverless Function
module.exports = async function handler(req, res) {
  // Handle CORS preflight
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

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Lazy load dependencies
    if (!BundleStorageKV) {
      ({
        BundleStorageKV,
      } = require('../../../packages/backend/src/lib/bundle-storage-kv'));
    }
    const store = new BundleStorageKV();

    // 2. Process request body
    const bundleManifest = req.body;
    if (!bundleManifest) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Bundle manifest validation failed',
        details: ['Missing manifest body'],
      });
    }

    const overwrite = bundleManifest._overwrite === true;

    // 3. Validate manifest
    const validation = validateBundleManifest(bundleManifest);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Bundle manifest validation failed',
        details: validation.errors,
      });
    }

    // 4. Check for existing bundle
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

    // 5. Signature verification
    if (bundleManifest.signature) {
      if (!ed25519) {
        ed25519 = await import('@noble/ed25519');
      }
      const canonical = canonicalizeBundle(bundleManifest);
      const message = new TextEncoder().encode(canonical);
      const signatureBytes = new Uint8Array(
        Buffer.from(bundleManifest.signature.sig, 'hex')
      );
      const pubkeyBytes = new Uint8Array(
        Buffer.from(
          bundleManifest.signature.pubkey.replace('ed25519:', ''),
          'hex'
        )
      );
      const signatureValid = await ed25519.verify(
        signatureBytes,
        message,
        pubkeyBytes
      );
      if (!signatureValid) {
        return res.status(400).json({
          error: 'invalid_signature',
          message: 'Bundle signature verification failed',
        });
      }
    }

    // 6. Store in Redis
    await store.storeBundleManifest(bundleManifest, overwrite);

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('CRITICAL: Push API Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message,
    });
  }
};
