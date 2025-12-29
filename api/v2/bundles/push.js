/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

module.exports = async (req, res) => {
  // Handle CORS
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
    const { kv } = require('../../../packages/backend/src/lib/kv-client');
    const bundleManifest = req.body;

    if (!bundleManifest) {
      return res
        .status(400)
        .json({ error: 'invalid_manifest', message: 'Missing body' });
    }

    const pkg = bundleManifest.package;
    const version = bundleManifest.appVersion;

    if (!pkg || !version) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing package or version',
      });
    }

    const key = `${pkg}/${version}`;
    const overwrite = bundleManifest._overwrite === true;

    if (!overwrite) {
      const existing = await kv.get(`bundle:${key}`);
      if (existing) {
        return res
          .status(409)
          .json({ error: 'bundle_exists', message: 'Already exists' });
      }
    }

    // Process binary
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
      const wasSet = await kv.setNX(
        `bundle:${key}`,
        JSON.stringify(manifestData)
      );
      if (!wasSet || wasSet === 0) {
        return res.status(409).json({ error: 'bundle_exists' });
      }
    }

    const { sAdd, set } = kv;
    await kv.sAdd(`bundle-versions:${pkg}`, version);
    await kv.sAdd('bundles:all', pkg);
    if (binary) {
      await kv.set(`binary:${key}`, binary);
    }

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: pkg,
      version: version,
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: error.message });
  }
};
