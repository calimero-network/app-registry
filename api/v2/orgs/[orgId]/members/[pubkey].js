/**
 * PATCH  /api/v2/orgs/:orgId/members/:email — update role (owner only)
 * DELETE /api/v2/orgs/:orgId/members/:email — remove member (admin/owner, or self-leave)
 *
 * Note: Vercel names the URL param 'pubkey' due to the filename, but it holds an email value.
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  updateOrgMemberRole,
  removeOrgMember,
} = require('../../../../lib/org-storage');
const {
  requireAuth,
  requireOrgOwner,
} = require('../../../../lib/auth-helpers');

async function countOrgOwners(orgId) {
  const members = await getOrgMembers(orgId);
  let n = 0;
  for (const m of members) {
    const role = await getOrgMemberRole(orgId, m);
    if (role === 'owner') n++;
  }
  return n;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  const memberEmail = req.query?.pubkey; // param is named 'pubkey' by filename but holds email
  if (
    !orgId ||
    !memberEmail ||
    typeof orgId !== 'string' ||
    typeof memberEmail !== 'string'
  ) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId or email' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let org;
  try {
    org = await getOrg(orgId);
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'internal', message: e?.message ?? String(e) });
  }
  if (!org) {
    return res
      .status(404)
      .json({ error: 'not_found', message: 'Organization not found' });
  }

  if (req.method === 'PATCH') {
    const user = await requireOrgOwner(req, res, orgId);
    if (!user) return;
    const { role } = req.body || {};
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'role must be "admin" or "member"',
      });
    }
    try {
      const currentRole = await getOrgMemberRole(orgId, memberEmail);
      if (currentRole === 'owner' && role !== 'owner') {
        const ownerCount = await countOrgOwners(orgId);
        if (ownerCount <= 1) {
          return res.status(409).json({
            error: 'last_owner',
            message:
              'Cannot demote the last owner. Promote another member to owner first.',
          });
        }
      }
      await updateOrgMemberRole(orgId, memberEmail, role);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const isSelf = user.email.toLowerCase() === memberEmail.toLowerCase();
    if (!isSelf) {
      const callerRole = await getOrgMemberRole(orgId, user.email);
      if (callerRole !== 'admin' && callerRole !== 'owner') {
        return res.status(403).json({
          error: 'forbidden',
          message:
            'Only an organization admin or owner can remove other members',
        });
      }
    }
    try {
      const targetRole = await getOrgMemberRole(orgId, memberEmail);
      if (targetRole === 'owner') {
        const ownerCount = await countOrgOwners(orgId);
        if (ownerCount <= 1) {
          return res.status(409).json({
            error: 'last_owner',
            message:
              'Cannot remove the last owner. Promote another member to owner first.',
          });
        }
      }
      await removeOrgMember(orgId, memberEmail);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
