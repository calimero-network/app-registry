/**
 * PATCH  /api/v2/orgs/:orgId/members/:member — update role (owner only)
 * DELETE /api/v2/orgs/:orgId/members/:member — remove member (admin/owner, or self-leave)
 *
 * Note: Vercel names the URL param 'pubkey' due to the filename, but it holds a username or an email.
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  updateOrgMemberRole,
  removeOrgMember,
  isOrgMember,
} = require('#api-lib/org-storage');
const { requireAuth, requireOrgOwner } = require('#api-lib/auth-helpers');
const { getUserByUsername } = require('#api-lib/user-storage');
const {
  resolveMemberEmail,
} = require('@calimero-network/registry-shared/org-invitation-flow');

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
  const memberParam = req.query?.pubkey;
  if (
    !orgId ||
    !memberParam ||
    typeof orgId !== 'string' ||
    typeof memberParam !== 'string'
  ) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId or member' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let org;
  try {
    org = await getOrg(orgId);
  } catch (e) {
    console.error('orgs route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
  if (!org) {
    return res
      .status(404)
      .json({ error: 'not_found', message: 'Organization not found' });
  }

  let memberEmail;
  try {
    memberEmail = await resolveMemberEmail(getUserByUsername, memberParam);
  } catch (e) {
    console.error('orgs route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
  if (!memberEmail) {
    return res.status(404).json({
      error: 'not_found',
      message: 'User is not a member of this organization',
    });
  }

  if (req.method === 'PATCH') {
    const user = await requireOrgOwner(req, res, orgId);
    if (!user) return;
    const { role } = req.body || {};
    if (role !== 'admin' && role !== 'member' && role !== 'owner') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'role must be "admin", "member", or "owner"',
      });
    }
    try {
      // SECURITY: updateOrgMemberRole writes a role for ANY address, even one
      // absent from the members set — a "ghost admin" that requireOrgAdminOrOwner
      // then honours although the member list never shows them. Refuse a role
      // change for anyone who is not currently a member of the org.
      if (!(await isOrgMember(orgId, memberEmail))) {
        return res.status(404).json({
          error: 'not_found',
          message: 'User is not a member of this organization',
        });
      }
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
      console.error('orgs route error:', e);
      return res
        .status(500)
        .json({ error: 'internal_error', message: 'Internal error' });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const isSelf = user.email.toLowerCase() === memberEmail.toLowerCase();
    let callerRole = null;
    if (!isSelf) {
      callerRole = await getOrgMemberRole(orgId, user.email);
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
      // SECURITY: an admin removing a privileged member could evict the org's
      // owners (or fellow admins) and seize control — the last-owner guard alone
      // does not stop it. Only an owner may remove an owner or admin; admins are
      // limited to plain members. Self-removal stays allowed (last-owner guard
      // below still applies).
      if (
        !isSelf &&
        (targetRole === 'owner' || targetRole === 'admin') &&
        callerRole !== 'owner'
      ) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only an organization owner can remove an owner or admin',
        });
      }
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
      console.error('orgs route error:', e);
      return res
        .status(500)
        .json({ error: 'internal_error', message: 'Internal error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
