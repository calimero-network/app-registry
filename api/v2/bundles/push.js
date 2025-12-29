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
    return obj.map(item => sortKeysRecursively(item));
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sorted[key] = sortKeysRecursively(value);
    } else if (Array.isArray(value)) {
      sorted[key] = value.map(item => sortKeysRecursively(item));
    } else {
      sorted[key] = value;
    }
  }
  return sorted;
}

/**
 * Canonicalize JSON for signing (sort keys recursively, remove signature)
 * Exported for testing
 */
function canonicalizeBundle(bundle) {
  // Remove signature for canonicalization
  // eslint-disable-next-line no-unused-vars
  const { signature, ...canonicalObj } = bundle;
  // Sort keys recursively
  const sorted = sortKeysRecursively(canonicalObj);
  return JSON.stringify(sorted);
}

/**
 * Verify V2 Bundle signature
 */
async function verifyBundleSignature(bundle) {
  if (!bundle.signature) {
    // Signature is optional for now (temporary for testing)
    return { valid: true, error: null };
  }

  try {
    const signature = bundle.signature;

    if (!signature.alg || signature.alg.toLowerCase() !== 'ed25519') {
      return {
        valid: false,
        error: 'Unsupported signature algorithm. Only ed25519 is supported.',
      };
    }

    if (!signature.pubkey || !signature.sig) {
      return {
        valid: false,
        error: 'Missing signature fields: pubkey and sig are required',
      };
    }

    // Load Ed25519 library
    if (!ed25519) {
      const nobleEd25519 = await import('@noble/ed25519');
      ed25519 = nobleEd25519.ed25519;
    }

    // Canonicalize bundle (without signature)
    const canonical = canonicalizeBundle(bundle);

    // Decode signature (remove 'base64:' prefix if present)
    const sigBase64 = signature.sig.replace(/^base64:/, '');
    const sigBuffer = Buffer.from(sigBase64, 'base64');

    // Decode public key (remove 'ed25519:' prefix if present)
    const pubkeyBase64 = signature.pubkey.replace(/^ed25519:/, '');
    const pubkeyBuffer = Buffer.from(pubkeyBase64, 'base64');

    // Verify signature
    const isValid = await ed25519.verify(
      sigBuffer,
      Buffer.from(canonical, 'utf8'),
      pubkeyBuffer
    );

    if (!isValid) {
      return {
        valid: false,
        error: `Signature verification failed for pubkey ${signature.pubkey}`,
      };
    }

    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: `Signature verification error: ${error.message}`,
    };
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

/**
 * Validate V2 Bundle manifest structure
 */
function validateBundleManifest(bundle) {
  const errors = [];

  if (!bundle.version) {
    errors.push('Missing required field: version');
  }
  if (!bundle.package) {
    errors.push('Missing required field: package');
  }
  if (!bundle.appVersion) {
    errors.push('Missing required field: appVersion');
  }

  // Validate metadata (required field)
  if (!bundle.metadata) {
    errors.push('Missing required field: metadata');
  } else if (
    typeof bundle.metadata !== 'object' ||
    Array.isArray(bundle.metadata)
  ) {
    errors.push('Invalid metadata field. Must be an object');
  }

  // Validate wasm (required field)
  if (!bundle.wasm) {
    errors.push('Missing required field: wasm');
  } else if (typeof bundle.wasm !== 'object' || Array.isArray(bundle.wasm)) {
    errors.push('Invalid wasm field. Must be an object');
  } else {
    // Validate wasm object structure
    if (!bundle.wasm.path || typeof bundle.wasm.path !== 'string') {
      errors.push('Missing or invalid wasm.path. Must be a non-empty string');
    }
    if (!bundle.wasm.hash || typeof bundle.wasm.hash !== 'string') {
      errors.push('Missing or invalid wasm.hash. Must be a non-empty string');
    }
    if (
      bundle.wasm.size === undefined ||
      bundle.wasm.size === null ||
      typeof bundle.wasm.size !== 'number' ||
      bundle.wasm.size < 0
    ) {
      errors.push(
        'Missing or invalid wasm.size. Must be a non-negative number'
      );
    }
  }

  // Validate package name format (basic validation)
  if (bundle.package && !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(bundle.package)) {
    errors.push(
      'Invalid package name format. Must be reverse domain notation (e.g., com.example.app)'
    );
  }

  // Validate appVersion is semver
  if (
    bundle.appVersion &&
    !/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(
      bundle.appVersion
    )
  ) {
    errors.push(
      'Invalid appVersion format. Must be valid semver (e.g., 1.0.0)'
    );
  }

  // Validate interfaces field structure (if present)
  if (bundle.interfaces !== undefined && bundle.interfaces !== null) {
    if (
      typeof bundle.interfaces !== 'object' ||
      Array.isArray(bundle.interfaces)
    ) {
      errors.push(
        'Invalid interfaces field. Must be an object with optional exports and uses arrays'
      );
    } else {
      // Validate exports array
      if (
        bundle.interfaces.exports !== undefined &&
        bundle.interfaces.exports !== null &&
        !Array.isArray(bundle.interfaces.exports)
      ) {
        errors.push(
          'Invalid interfaces.exports. Must be an array of interface names'
        );
      }

      // Validate uses array
      if (
        bundle.interfaces.uses !== undefined &&
        bundle.interfaces.uses !== null &&
        !Array.isArray(bundle.interfaces.uses)
      ) {
        errors.push(
          'Invalid interfaces.uses. Must be an array of interface names'
        );
      }

      // Validate interface names are strings
      if (Array.isArray(bundle.interfaces.exports)) {
        for (const iface of bundle.interfaces.exports) {
          if (typeof iface !== 'string' || iface.trim().length === 0) {
            errors.push(
              'Invalid interface name in exports. Must be a non-empty string'
            );
            break;
          }
        }
      }

      if (Array.isArray(bundle.interfaces.uses)) {
        for (const iface of bundle.interfaces.uses) {
          if (typeof iface !== 'string' || iface.trim().length === 0) {
            errors.push(
              'Invalid interface name in uses. Must be a non-empty string'
            );
            break;
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export the main handler
const handler = async (req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const store = getStorage();
    let bundleManifest;

    // Handle multipart/form-data (file upload)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // For now, expect JSON body with manifest
      // TODO: Handle actual .mpk file upload
      return res.status(400).json({
        error: 'multipart_not_implemented',
        message:
          'Multipart file upload not yet implemented. Please send JSON manifest.',
      });
    }

    // Handle JSON body
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        error: 'invalid_request',
        message:
          'Request body must be a JSON object (bundle manifest), not an array',
      });
    }

    bundleManifest = req.body;

    // 1. Validate bundle manifest structure
    const validation = validateBundleManifest(bundleManifest);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Bundle manifest validation failed',
        details: validation.errors,
      });
    }

    // 2. Verify signature (if present) - do this before atomic storage
    const signatureResult = await verifyBundleSignature(bundleManifest);
    if (!signatureResult.valid) {
      return res.status(400).json({
        error: 'invalid_signature',
        message: 'Bundle signature verification failed',
        details: signatureResult.error,
      });
    }

    // 3. Atomic store bundle manifest (prevents race conditions)
    // storeBundleManifest uses SETNX internally for atomic check-and-set
    try {
      await store.storeBundleManifest(bundleManifest);
    } catch (error) {
      // Check if error is due to bundle already existing
      if (
        error.message &&
        error.message.includes('already exists') &&
        error.message.includes('First-come-first-serve')
      ) {
        return res.status(409).json({
          error: 'bundle_exists',
          message: `Bundle ${bundleManifest.package}@${bundleManifest.appVersion} already exists. First-come-first-serve policy.`,
        });
      }
      // Re-throw other errors
      throw error;
    }

    // 5. Return success
    return res.status(201).json({
      success: true,
      message: `Bundle ${bundleManifest.package}@${bundleManifest.appVersion} published successfully`,
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
      signed: !!bundleManifest.signature,
    });
  } catch (error) {
    console.error('Error pushing bundle:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to push bundle',
    });
  }
};

// Export functions for testing (before overwriting with handler)
handler.canonicalizeBundle = canonicalizeBundle;
handler.sortKeysRecursively = sortKeysRecursively;

module.exports = handler;
