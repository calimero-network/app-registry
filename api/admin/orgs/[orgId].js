/**
 * Admin org management.
 * DELETE /api/admin/orgs/:orgId      — delete org
 * PATCH  /api/admin/orgs/:orgId      — body: { action: 'verify'|'unverify' }
 */
const { requireAdmin } = require('../../lib/auth-helpers');
const { deleteOrg, getOrg, setOrg } = require('../../lib/org-storage');
const { setAdminVerified } = require('../../lib/admin-storage');

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { orgId } = req.query;
  if (!orgId)
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'orgId required' });

  if (req.method === 'DELETE') {
    await deleteOrg(orgId);
    await setAdminVerified('org', orgId, false);
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { action } = req.body || {};

    if (action === 'verify') {
      await setAdminVerified('org', orgId, true);
      const org = await getOrg(orgId);
      if (org) await setOrg({ ...org, verified: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'unverify') {
      await setAdminVerified('org', orgId, false);
      const org = await getOrg(orgId);
      if (org) await setOrg({ ...org, verified: false });
      return res.status(200).json({ ok: true });
    }

    return res
      .status(400)
      .json({ error: 'bad_action', message: 'Unknown action' });
  }

  return res.status(405).end();
};
