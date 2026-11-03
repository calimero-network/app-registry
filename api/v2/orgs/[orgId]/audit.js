/**
 * GET /api/v2/orgs/:orgId/audit?limit=50&offset=0
 *
 * The org's append-only audit log (api/lib/org-audit.js), newest first:
 * publishes, visibility changes and requests, yanks, deletes.
 *
 * `:orgId` is a registry org id, or a Cloud org id linked to one (so the Cloud
 * console can ask with the id it already has).
 *
 * Who: a Cloud token of that Cloud org with role `owner` or `admin`; a
 * registry account that is an admin/owner of the org; a site admin.
 */

const {
  getOrg,
  getOrgByCloudOrg,
  getOrgIdByCloudOrg,
  getOrgMemberRole,
} = require('#api-lib/org-storage');
const { requireAuth } = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');
const { listAudit } = require('#api-lib/org-audit');

async function mayReadAudit(user, org) {
  if (user.cloud) {
    if (user.role !== 'owner' && user.role !== 'admin') return false;
    return (await getOrgIdByCloudOrg(user.cloudOrgId)) === org.id;
  }
  const role = await getOrgMemberRole(org.id, user.email);
  if (role === 'owner' || role === 'admin') return true;
  return !!(await isAdmin(user.email));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const id = req.query?.orgId;
  if (!id || typeof id !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'orgId required' });
  }

  const user = await requireAuth(req, res, { allowCloud: true });
  if (!user) return undefined;

  try {
    const org = (await getOrg(id)) || (await getOrgByCloudOrg(id));
    if (!org) {
      return res
        .status(404)
        .json({ error: 'not_found', message: 'Organization not found' });
    }
    if (!(await mayReadAudit(user, org))) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only an organization admin or owner can read its audit log',
      });
    }
    const { events, total } = await listAudit(org.id, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return res.status(200).json({
      org_id: org.id,
      cloud_org_id: org.cloud_org_id || null,
      total,
      events,
    });
  } catch (err) {
    console.error('audit read error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
