/**
 * Record a download (public endpoint).
 * POST /api/v2/downloads/record
 * Body: { "package": "com.example.app", "version": "1.0.0" } (version optional)
 *
 * Increments Redis: downloads:total, downloads:<package>
 * No auth; call after a successful artifact download/install.
 */

const { kv } = require('../../lib/kv-client');

const PACKAGE_REGEX = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  } catch {
    body = {};
  }

  const packageName = body.package ?? body.pkg;
  if (!packageName || typeof packageName !== 'string') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Missing or invalid "package" in body',
    });
  }

  const pkg = packageName.trim();
  if (!PACKAGE_REGEX.test(pkg)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Invalid package name format',
    });
  }

  try {
    await kv.incr('downloads:total');
    await kv.incr(`downloads:${pkg}`);
    console.log('Download recorded', { package: pkg, version: body.version || null });
    return res.status(200).json({ ok: true, package: pkg });
  } catch (error) {
    console.error('Record download error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
