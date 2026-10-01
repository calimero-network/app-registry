/**
 * Serve Bundle Artifacts from KV
 * GET /api/artifacts/:package/:version/:filename
 * Also accessible via rewrite: /artifacts/:package/:version/:filename
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

/**
 * Drop internal `_`-prefixed metadata keys (e.g. `_ownerEmail`) from a manifest
 * before it is returned to a client. The full bundle sanitizer is the canonical
 * path, but this endpoint only echoes a manifest on a rare 409, so a targeted
 * strip keeps the diagnostic dependency-free.
 */
function stripInternalMetadata(manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.metadata) {
    return manifest;
  }
  const metadata = {};
  for (const [key, value] of Object.entries(manifest.metadata)) {
    if (!key.startsWith('_')) metadata[key] = value;
  }
  return { ...manifest, metadata };
}

module.exports = async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel passes dynamic route params via req.query
  // For file structure [package]/[version]/[filename].js
  // Parameters are: req.query.package, req.query.version, req.query.filename
  let pkg = req.query?.package;
  let version = req.query?.version;
  let filename = req.query?.filename;

  // If parameters are missing or contain literal "$package" (Vercel rewrite issue),
  // parse from URL path
  if (!pkg || !version || pkg === '$package' || version === '$version') {
    // Strip query string from URL path before matching
    const urlPath = (req.url || '').split('?')[0];
    // Match both /api/artifacts/... and /artifacts/... patterns
    // Also handle cases where the URL might be the rewritten path
    const match = urlPath.match(
      /\/(?:api\/)?artifacts\/([^/]+)\/([^/]+)\/([^/]+)/
    );
    if (match) {
      // Only use parsed values if query params are missing or invalid
      if (!pkg || pkg === '$package') pkg = match[1];
      if (!version || version === '$version') version = match[2];
      if (!filename || filename === '$filename') filename = match[3];
    }
  }

  if (!pkg || !version || pkg === '$package' || version === '$version') {
    return res.status(400).json({
      error: 'missing_params',
      message: `Missing package or version parameter. Received: package=${pkg || 'undefined'}, version=${version || 'undefined'}`,
      debug: {
        query: req.query,
        url: req.url,
      },
    });
  }

  try {
    const store = getStorage();
    const [binaryHex, manifest] = await Promise.all([
      store.getBundleBinary(pkg, version),
      store.getBundleManifest(pkg, version),
    ]);

    if (!binaryHex) {
      if (!manifest) {
        return res.status(404).json({
          error: 'artifact_not_found',
          message: `${pkg}@${version} not found`,
        });
      }
      // Privacy: this diagnostic returns the stored manifest, which carries
      // internal `_`-prefixed metadata (notably `metadata._ownerEmail`). Strip
      // those before responding so the account email never leaks on this path.
      return res.status(409).json({
        error: 'binary_missing',
        message: `Manifest for ${pkg}@${version} exists but binary was never uploaded. Re-publish the bundle.`,
        manifest: stripInternalMetadata(manifest),
      });
    }

    // Expose min_runtime_version for runtime compatibility (Rust expects this)
    const minRuntimeVersion =
      manifest?.minRuntimeVersion ?? manifest?.min_runtime_version;
    const minRuntimeVersionHeader =
      minRuntimeVersion != null && String(minRuntimeVersion).trim()
        ? String(minRuntimeVersion).trim()
        : '0.1.0';
    res.setHeader('X-Min-Runtime-Version', minRuntimeVersionHeader);

    const binary = Buffer.from(binaryHex, 'hex');

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/gzip'); // MPK is a Gzip compressed tarball
    res.setHeader('Content-Length', binary.length);
    // SECURITY: `filename` comes from the URL. A raw quote or control char would
    // break out of the quoted header value (header injection). Strip anything
    // that is not a safe filename char, and fall back to a fixed pattern if
    // nothing usable remains.
    const safeFilename =
      String(filename || '')
        .replace(/[^A-Za-z0-9._-]/g, '')
        .slice(0, 128) ||
      `${pkg}-${version}.mpk`.replace(/[^A-Za-z0-9._-]/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"`
    );

    return res.status(200).send(binary);
  } catch (error) {
    console.error('Error serving artifact:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
};
