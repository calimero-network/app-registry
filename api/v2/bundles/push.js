/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

const { kv } = require('../../../packages/backend/src/lib/kv-client');
const semver = require('semver');

// Helpers
function sortKeysRecursively(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysRecursively);
  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = sortKeysRecursively(obj[key]);
    });
  return sorted;
}

function canonicalizeJSON(obj) {
  return JSON.stringify(sortKeysRecursively(obj));
}

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

function validateBundleManifest(manifest) {
  const errors = [];
  if (!manifest) return { valid: false, errors: ['Missing manifest'] };
  if (manifest.version !== '1.0') errors.push('Invalid version');
  if (!manifest.package) errors.push('Missing package');
  if (!manifest.appVersion) errors.push('Missing appVersion');
  if (!manifest.metadata) errors.push('Missing metadata');
  if (!manifest.wasm) errors.push('Missing wasm');
  return { valid: errors.length === 0, errors };
}

// The Vercel Serverless Function
module.exports = async (req, res) => {
  // 1. CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bundleManifest = req.body;
    if (!bundleManifest) {
      return res
        .status(400)
        .json({ error: 'invalid_manifest', message: 'Missing body' });
    }

    const validation = validateBundleManifest(bundleManifest);
    if (!validation.valid) {
      return res
        .status(400)
        .json({ error: 'invalid_manifest', details: validation.errors });
    }

    const key = `${bundleManifest.package}/${bundleManifest.appVersion}`;
    const overwrite = bundleManifest._overwrite === true;

    // 2. Check existence
    if (!overwrite) {
      const existing = await kv.get(`bundle:${key}`);
      if (existing) {
        return res
          .status(409)
          .json({ error: 'bundle_exists', message: 'Already exists' });
      }
    }

    // 3. Signature
    if (bundleManifest.signature) {
      const ed25519 = await import('@noble/ed25519');
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
      const isValid = await ed25519.verify(
        signatureBytes,
        message,
        pubkeyBytes
      );
      if (!isValid) {
        return res.status(400).json({ error: 'invalid_signature' });
      }
    }

    // 4. Store
    const _binary = bundleManifest._binary;
    const cleanManifest = { ...bundleManifest };
    delete cleanManifest._binary;
    delete cleanManifest._overwrite;

    const manifestData = {
      json: cleanManifest,
      created_at: new Date().toISOString(),
    };

    // Atomic set if not overwrite
    if (overwrite) {
      await kv.set(`bundle:${key}`, JSON.stringify(manifestData));
    } else {
      const wasSet = await kv.setNX(
        `bundle:${key}`,
        JSON.stringify(manifestData)
      );
      if (!wasSet || wasSet === 0) {
        return res.status(409).json({ error: 'bundle_exists' });
      }
    }

    // Indexing
    await kv.sAdd(
      `bundle-versions:${bundleManifest.package}`,
      bundleManifest.appVersion
    );
    await kv.sAdd('bundles:all', bundleManifest.package);
    if (_binary) {
      await kv.set(`binary:${key}`, _binary);
    }

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: error.message });
  }
};
