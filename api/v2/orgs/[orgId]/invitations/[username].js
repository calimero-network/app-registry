/**
 * DELETE /api/v2/orgs/:orgId/invitations/:username — revoke a pending invitation (admin/owner)
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
  const username = req.query?.username;
  if (
    !orgId ||
    !username ||
    typeof orgId !== 'string' ||
    typeof username !== 'string'
  ) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId or username' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') {
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
    const { status, body } = await flow.revoke(orgId, username);
    return body ? res.status(status).json(body) : res.status(status).end();
  } catch (e) {
    console.error('org invitations route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
