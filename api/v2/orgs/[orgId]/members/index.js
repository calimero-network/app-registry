/**
 * GET  /api/v2/orgs/:orgId/members — list members (email + role, public)
 * POST /api/v2/orgs/:orgId/members — add member by email (owner for admin, admin/owner for member)
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  addOrgMember,
} = require('../../../../lib/org-storage');
const {
  requireOrgAdminOrOwner,
  requireOrgOwner,
} = require('../../../../lib/auth-helpers');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  if (req.method === 'GET') {
    try {
      const emails = await getOrgMembers(orgId);
      const members = [];
      for (const email of emails) {
        const role = await getOrgMemberRole(orgId, email);
        members.push({ email, role: role || 'member' });
      }
      return res.status(200).json({ members });
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  if (req.method === 'POST') {
    const { email, role } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Body must include email (string)',
      });
    }
    const memberEmail = email.trim();
    if (!EMAIL_REGEX.test(memberEmail)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'email is not a valid email address',
      });
    }
    const roleNorm = role === 'admin' ? 'admin' : 'member';
    // Adding admin requires owner; adding member requires admin or owner
    if (roleNorm === 'admin') {
      const user = await requireOrgOwner(req, res, orgId);
      if (!user) return;
    } else {
      const user = await requireOrgAdminOrOwner(req, res, orgId);
      if (!user) return;
    }
    try {
      const existingRole = await getOrgMemberRole(orgId, memberEmail);
      if (existingRole) {
        return res.status(409).json({
          error: 'conflict',
          message: 'This email is already a member of the organization',
        });
      }
      await addOrgMember(orgId, memberEmail, roleNorm);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
