/**
 * GET /api/v2/orgs/:orgId/invitations — pending invitations (admin/owner)
 */

const { getOrg } = require('#api-lib/org-storage');
const { requireOrgAdminOrOwner } = require('#api-lib/auth-helpers');
const { flow } = require('#api-lib/invitation-flow');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  if (!orgId || typeof orgId !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await getOrg(orgId))) {
      return res
        .status(404)
        .json({ error: 'not_found', message: 'Organization not found' });
    }
    const user = await requireOrgAdminOrOwner(req, res, orgId);
    if (!user) return;
    const { status, body } = await flow.listForOrg(orgId);
    return res.status(status).json(body);
  } catch (e) {
    console.error('org invitations route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
