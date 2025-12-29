/**
 * Serve Bundle Artifacts from KV
 * GET /api/artifacts/:package/:version/:filename
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

  // Vercel passes dynamic route params via req.query
  // For file structure [package]/[version]/[filename].js
  // Parameters are: req.query.package, req.query.version, req.query.filename
  let pkg = req.query?.package;
  let version = req.query?.version;
  const filename = req.query?.filename;

  // If parameters are missing from query (can happen with rewrites),
  // try parsing from URL path
  if (!pkg || !version) {
    const url = req.url || '';
    // URL format: /api/artifacts/:package/:version/:filename
    const match = url.match(/\/artifacts\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
    if (match) {
      pkg = pkg || match[1];
      version = version || match[2];
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
