/**
 * Serve Bundle Artifacts from KV
 * GET /api/artifacts/:package/:version/:filename
 * Also accessible via rewrite: /artifacts/:package/:version/:filename
 */

const {
  BundleStorageKV,
} = require('../../../../packages/backend/src/lib/bundle-storage-kv');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
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

  // Vercel passes dynamic route params via req.query for direct API calls
  // For rewrites from /artifacts/... to /api/artifacts/..., params may be in URL path
  let pkg = req.query?.package;
  let version = req.query?.version;
  const filename = req.query?.filename;

  // If parameters are missing from query (happens with rewrites),
  // parse from URL path
  if (!pkg || !version) {
    const url = req.url || '';
    // Match both /api/artifacts/... and /artifacts/... patterns
    const match = url.match(/\/(?:api\/)?artifacts\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
    if (match) {
      pkg = pkg || match[1];
      version = version || match[2];
      // filename is optional, use from match if not in query
      if (!filename && match[3]) {
        // filename is already set from query if present, so we don't override it
      }
    }
  }

  // Debug logging
  console.log('Artifact endpoint - Full request info:', {
    query: req.query,
    url: req.url,
    method: req.method,
    pkg,
    version,
    filename,
  });

  if (!pkg || !version) {
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
    const binaryHex = await store.getBundleBinary(pkg, version);

    if (!binaryHex) {
      return res.status(404).json({
        error: 'artifact_not_found',
        message: `Binary for ${pkg}@${version} not found in storage`,
      });
    }

    const binary = Buffer.from(binaryHex, 'hex');

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/zip'); // MPK is a Gzip compressed tarball
    res.setHeader('Content-Length', binary.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename || `${pkg}-${version}.mpk`}"`
    );

    return res.status(200).send(binary);
  } catch (error) {
    console.error('Error serving artifact:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      message: error.message || 'Failed to serve artifact',
    });
  }
};
