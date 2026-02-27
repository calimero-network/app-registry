/**
 * PATCH /api/v2/orgs/:orgId/members/:pubkey — update role (admin only)
 * DELETE /api/v2/orgs/:orgId/members/:pubkey — remove member (admin only)
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  updateOrgMemberRole,
  removeOrgMember,
} = require('../../../../../../packages/backend/src/lib/org-storage');
const { requireOrgAdmin } = require('../../../../../lib/signed-request');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Pubkey, X-Signature'
  );
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  const pubkey = req.query?.pubkey;
  if (
    !orgId ||
    !pubkey ||
    typeof orgId !== 'string' ||
    typeof pubkey !== 'string'
  ) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing orgId or pubkey',
    });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let org;
  try {
    org = await getOrg(orgId);
  } catch (e) {
    console.error('getOrg error:', e);
    return res.status(500).json({
      error: 'internal',
      message: e?.message ?? String(e),
    });
  }

  if (!org) {
    return res.status(404).json({
      error: 'not_found',
      message: 'Organization not found',
    });
  }

  const result = await requireOrgAdmin(req, res, orgId);
  if (result === null) return;

  if (req.method === 'PATCH') {
    const { role } = req.body || {};
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'role must be "admin" or "member"',
      });
    }
    try {
      const currentRole = await getOrgMemberRole(orgId, pubkey);
      if (currentRole === 'admin' && role === 'member') {
        const allMembers = await getOrgMembers(orgId);
        let adminCount = 0;
        for (const pk of allMembers) {
          const r = await getOrgMemberRole(orgId, pk);
          if (r === 'admin') adminCount++;
        }
        if (adminCount <= 1) {
          return res.status(409).json({
            error: 'last_admin',
            message:
              'Cannot demote the last admin. Promote another member to admin first.',
          });
        }
      }
      await updateOrgMemberRole(orgId, pubkey, role);
      return res.status(204).end();
    } catch (e) {
      console.error('PATCH member error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const targetRole = await getOrgMemberRole(orgId, pubkey);
      if (targetRole === 'admin') {
        const allMembers = await getOrgMembers(orgId);
        let adminCount = 0;
        for (const pk of allMembers) {
          const r = await getOrgMemberRole(orgId, pk);
          if (r === 'admin') adminCount++;
        }
        if (adminCount <= 1) {
          return res.status(409).json({
            error: 'last_admin',
            message:
              'Cannot remove the last admin. Promote another member to admin first.',
          });
        }
      }
      await removeOrgMember(orgId, pubkey);
      return res.status(204).end();
    } catch (e) {
      console.error('DELETE member error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
