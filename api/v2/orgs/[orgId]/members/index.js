/**
 * GET /api/v2/orgs/:orgId/members — list members (public)
 * POST /api/v2/orgs/:orgId/members — add member (admin only; body: pubkey, role?)
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  addOrgMember,
} = require('../../../../lib/org-storage');
const { validatePublicKey } = require('../../../../lib/verify');
const { requireOrgAdmin } = require('../../../../lib/signed-request');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Pubkey, X-Signature'
  );
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  if (!orgId || typeof orgId !== 'string') {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing orgId',
    });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  if (req.method === 'GET') {
    try {
      const pubkeys = await getOrgMembers(orgId);
      const members = [];
      for (const pk of pubkeys) {
        const role = await getOrgMemberRole(orgId, pk);
        members.push({ pubkey: pk, role: role || 'member' });
      }
      return res.status(200).json({ members });
    } catch (e) {
      console.error('GET members error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  if (req.method === 'POST') {
    const result = await requireOrgAdmin(req, res, orgId);
    if (result === null) return;
    const { pubkey, role } = req.body || {};
    if (!pubkey || typeof pubkey !== 'string') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Body must include pubkey (string)',
      });
    }
    const pk = pubkey.trim();
    if (!validatePublicKey(pk)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'pubkey is not a valid public key',
      });
    }
    try {
      await addOrgMember(orgId, pk, role === 'admin' ? 'admin' : 'member');
      return res.status(204).end();
    } catch (e) {
      console.error('POST member error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
