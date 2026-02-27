/**
 * GET /api/v2/orgs/:orgId — get org (public)
 * PATCH /api/v2/orgs/:orgId — update org (admin only)
 * DELETE /api/v2/orgs/:orgId — delete org (admin only)
 */

const {
  getOrg,
  setOrg,
  deleteOrg,
} = require('../../../../packages/backend/src/lib/org-storage');
const { requireOrgAdmin } = require('../../../lib/signed-request');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
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
    return res.status(200).json(org);
  }

  if (req.method === 'PATCH') {
    const result = await requireOrgAdmin(req, res, orgId);
    if (result === null) return;
    const { name, metadata } = req.body || {};
    const updates = {};
    if (typeof name === 'string') updates.name = name.trim();
    if (metadata !== undefined && typeof metadata === 'object')
      updates.metadata = metadata;
    if (Object.keys(updates).length === 0) {
      return res.status(200).json(org);
    }
    try {
      const updated = { ...org, ...updates };
      await setOrg(updated);
      return res.status(200).json(updated);
    } catch (e) {
      console.error('PATCH org error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  if (req.method === 'DELETE') {
    const result = await requireOrgAdmin(req, res, orgId);
    if (result === null) return;
    try {
      await deleteOrg(orgId);
      return res.status(204).end();
    } catch (e) {
      console.error('DELETE org error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
