/**
 * V2 Bundle Listing API
 * GET /api/v2/bundles
 */

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { kv } = require('../../../packages/backend/src/lib/kv-client');
    const semver = require('semver');
    const { package: pkg, version, developer } = req.query || {};

    if (pkg && version) {
      const data = await kv.get(`bundle:${pkg}/${version}`);
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json([JSON.parse(data).json]);
    }

    const allPackages = await kv.sMembers('bundles:all');
    const bundles = [];
    for (const packageName of allPackages) {
      if (pkg && packageName !== pkg) continue;

      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (versions.length === 0) continue;

      const sorted = versions.sort((a, b) =>
        semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
      );
      const latestVersion = sorted[0];

      const data = await kv.get(`bundle:${packageName}/${latestVersion}`);
      if (!data) continue;
      const bundle = JSON.parse(data).json;

      if (developer && bundle.signature?.pubkey !== developer) continue;
      bundles.push(bundle);
    }

    bundles.sort((a, b) => a.package.localeCompare(b.package));
    return res.status(200).json(bundles);
  } catch (error) {
    console.error('List Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: error.message });
  }
};
