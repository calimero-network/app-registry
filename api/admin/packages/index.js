/** GET /api/admin/packages — list all packages */
const { requireAdmin } = require('../../lib/auth-helpers');
const { kv } = require('../../lib/kv-client');
const { getAdminVerified } = require('../../lib/admin-storage');
const semver = require('semver');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const allPackages = await kv.sMembers('bundles:all');
    const packages = [];

    for (const packageName of allPackages) {
      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (!versions.length) continue;
      const sorted = versions.sort((a, b) =>
        semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
      );
      const latestVersion = sorted[0];
      const data = await kv.get(`bundle:${packageName}/${latestVersion}`);
      if (!data) continue;
      const bundle = JSON.parse(data).json;
      const adminVerified = await getAdminVerified('package', packageName);
      const ownerEmail = (bundle.metadata?._ownerEmail || bundle.metadata?.author || '').toLowerCase();
      const downloads = parseInt(
        (await kv.get(`downloads:${packageName.toLowerCase()}`)) || '0',
        10
      );
      packages.push({
        name: packageName,
        latestVersion,
        versionCount: versions.length,
        author: bundle.metadata?.author || '',
        verified:
          adminVerified || ownerEmail.endsWith('@calimero.network'),
        adminVerified,
        downloads,
      });
    }

    packages.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ packages });
  } catch (err) {
    console.error('admin/packages GET error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err.message });
  }
};
