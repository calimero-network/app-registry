/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

const { kv } = require('../../../packages/backend/src/lib/kv-client');

module.exports = async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bundleManifest = req.body;

    if (!bundleManifest || !bundleManifest.package || !bundleManifest.appVersion) {
      return res.status(400).json({ 
        error: 'invalid_manifest', 
        message: 'Missing required fields: package, appVersion' 
      });
    }

    const key = `${bundleManifest.package}/${bundleManifest.appVersion}`;
    const overwrite = bundleManifest._overwrite === true;

    // Optimized Binary Storage
    const binary = bundleManifest._binary;
    const cleanManifest = { ...bundleManifest };
    delete cleanManifest._binary;
    delete cleanManifest._overwrite;
    
    const manifestData = {
      json: cleanManifest,
      created_at: new Date().toISOString(),
    };

    if (overwrite) {
      await kv.set(`bundle:${key}`, JSON.stringify(manifestData));
    } else {
      const wasSet = await kv.setNX(`bundle:${key}`, JSON.stringify(manifestData));
      if (!wasSet || wasSet === 0) {
        return res.status(409).json({ error: 'bundle_exists' });
      }
    }

    await kv.sAdd(`bundle-versions:${bundleManifest.package}`, bundleManifest.appVersion);
    await kv.sAdd('bundles:all', bundleManifest.package);
    if (binary) {
      await kv.set(`binary:${key}`, binary);
    }

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res.status(500).json({ error: 'internal_error', message: error.message });
  }
};
