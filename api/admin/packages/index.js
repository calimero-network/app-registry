/** GET /api/admin/packages — list all packages */
const { requireAdmin } = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const { getAdminVerified } = require('#api-lib/admin-storage');
const semver = require('semver');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const allPackages = await kv.sMembers('bundles:all');

    // ⚠️ THREE WAVES, NOT FOUR ROUND TRIPS PER PACKAGE.
    //
    // The version set, the manifest, the admin-verified flag and the download
    // counter were each `await`ed inside a `for`, so the Packages tab cost up
    // to 4N SERIALISED Redis round trips. Same property the bundle listing
    // holds (tests/bundle-listing-batching.test.js): sequential round trips
    // must not grow with the number of packages. node-redis pipelines
    // commands issued in one tick, so each `Promise.all` is one wave.
    const versionSets = await Promise.all(
      allPackages.map(name => kv.sMembers(`bundle-versions:${name}`))
    );

    const candidates = [];
    allPackages.forEach((name, i) => {
      const versions = versionSets[i];
      if (!versions.length) return;
      const sorted = [...versions].sort((a, b) =>
        semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
      );
      candidates.push({ name, versions, latestVersion: sorted[0] });
    });

    // The manifest, the flag and the counter for every candidate, all in
    // flight together rather than three at a time per package.
    const [manifests, flags, counters] = await Promise.all([
      Promise.all(
        candidates.map(c => kv.get(`bundle:${c.name}/${c.latestVersion}`))
      ),
      Promise.all(candidates.map(c => getAdminVerified('package', c.name))),
      Promise.all(
        candidates.map(c => kv.get(`downloads:${c.name.toLowerCase()}`))
      ),
    ]);

    const packages = [];
    candidates.forEach((c, i) => {
      const data = manifests[i];
      if (!data) return;
      let bundle;
      try {
        bundle = JSON.parse(data).json;
      } catch {
        // One corrupt manifest should not empty the admin's package list.
        return;
      }
      const adminVerified = flags[i];
      const ownerEmail = (
        bundle.metadata?._ownerEmail ||
        bundle.metadata?.author ||
        ''
      ).toLowerCase();
      packages.push({
        name: c.name,
        latestVersion: c.latestVersion,
        versionCount: c.versions.length,
        author: bundle.metadata?.author || '',
        verified: adminVerified || ownerEmail.endsWith('@calimero.network'),
        adminVerified,
        downloads: parseInt(counters[i] || '0', 10),
      });
    });

    packages.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ packages });
  } catch (err) {
    console.error('admin/packages GET error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err.message });
  }
};
