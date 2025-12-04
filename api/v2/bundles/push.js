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
} = require('../../packages/backend/src/lib/bundle-storage-kv');

// Dynamic import for Ed25519
let ed25519;

/**
 * Canonicalize JSON for signing (sort keys, remove signature)
 */
function canonicalizeBundle(bundle) {
  // Remove signature for canonicalization
  // eslint-disable-next-line no-unused-vars
  const { signature, ...canonicalObj } = bundle;
  // Sort keys recursively
  return JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
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

  // Validate package name format (basic validation)
  if (bundle.package && !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(bundle.package)) {
    errors.push('Invalid package name format. Must be reverse domain notation (e.g., com.example.app)');
  }

  // Validate appVersion is semver
  if (bundle.appVersion && !/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(bundle.appVersion)) {
    errors.push('Invalid appVersion format. Must be valid semver (e.g., 1.0.0)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = async (req, res) => {
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
        message: 'Multipart file upload not yet implemented. Please send JSON manifest.',
      });
    }

    // Handle JSON body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Request body must be JSON bundle manifest',
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

    // 2. Check if bundle already exists (first-come-first-serve)
    const existing = await store.getBundleManifest(
      bundleManifest.package,
      bundleManifest.appVersion
    );

    if (existing) {
      return res.status(409).json({
        error: 'bundle_exists',
        message: `Bundle ${bundleManifest.package}@${bundleManifest.appVersion} already exists. First-come-first-serve policy.`,
      });
    }

    // 3. Verify signature (if present)
    const signatureResult = await verifyBundleSignature(bundleManifest);
    if (!signatureResult.valid) {
      return res.status(400).json({
        error: 'invalid_signature',
        message: 'Bundle signature verification failed',
        details: signatureResult.error,
      });
    }

    // 4. Store bundle manifest
    await store.storeBundleManifest(bundleManifest);

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

