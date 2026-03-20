/**
 * Admin package management.
 * DELETE /api/admin/packages/:packageName      — delete entire package
 * PATCH  /api/admin/packages/:packageName      — body: { action: 'verify'|'unverify' }
 */
const { requireAdmin } = require('../../lib/auth-helpers');
const { kv } = require('../../lib/kv-client');
const { setAdminVerified } = require('../../lib/admin-storage');

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { packageName } = req.query;
  if (!packageName)
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'packageName required' });

  if (req.method === 'DELETE') {
    const versions = await kv.sMembers(`bundle-versions:${packageName}`);
    for (const v of versions) {
      await kv.del(`bundle:${packageName}/${v}`);
    }
    await kv.del(`bundle-versions:${packageName}`);
    await kv.sRem('bundles:all', packageName);
    await kv.del(`downloads:${packageName.toLowerCase()}`);
    await setAdminVerified('package', packageName, false);
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { action, version } = req.body || {};

    if (action === 'delete_version') {
      if (!version) return res.status(400).json({ error: 'version required' });
      await kv.del(`bundle:${packageName}/${version}`);
      await kv.sRem(`bundle-versions:${packageName}`, version);
      // If no versions left, remove package entirely
      const remaining = await kv.sMembers(`bundle-versions:${packageName}`);
      if (!remaining.length) {
        await kv.sRem('bundles:all', packageName);
        await kv.del(`downloads:${packageName.toLowerCase()}`);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'verify') {
      await setAdminVerified('package', packageName, true);
      // Also patch the latest bundle manifest so frontend sees it immediately
      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (versions.length) {
        const semver = require('semver');
        const latest = versions.sort((a, b) =>
          semver.rcompare(
            semver.valid(a) || '0.0.0',
            semver.valid(b) || '0.0.0'
          )
        )[0];
        const raw = await kv.get(`bundle:${packageName}/${latest}`);
        if (raw) {
          const stored = JSON.parse(raw);
          stored.json.metadata = stored.json.metadata || {};
          stored.json.metadata._adminVerified = true;
          await kv.set(
            `bundle:${packageName}/${latest}`,
            JSON.stringify(stored)
          );
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'unverify') {
      await setAdminVerified('package', packageName, false);
      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (versions.length) {
        const semver = require('semver');
        const latest = versions.sort((a, b) =>
          semver.rcompare(
            semver.valid(a) || '0.0.0',
            semver.valid(b) || '0.0.0'
          )
        )[0];
        const raw = await kv.get(`bundle:${packageName}/${latest}`);
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored.json.metadata) delete stored.json.metadata._adminVerified;
          await kv.set(
            `bundle:${packageName}/${latest}`,
            JSON.stringify(stored)
          );
        }
      }
      return res.status(200).json({ ok: true });
    }

    return res
      .status(400)
      .json({ error: 'bad_action', message: 'Unknown action' });
  }

  return res.status(405).end();
};
