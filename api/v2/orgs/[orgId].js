/**
 * GET    /api/v2/orgs/:orgId — get org (public)
 * PATCH  /api/v2/orgs/:orgId — update org (admin or owner)
 * DELETE /api/v2/orgs/:orgId — delete org (owner only)
 */

const {
  getOrg,
  getOrgIdBySlug,
  setOrg,
  deleteOrg,
} = require('../../lib/org-storage');
const {
  requireOrgAdminOrOwner,
  requireOrgOwner,
} = require('../../lib/auth-helpers');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const orgId = req.query?.orgId;
  if (!orgId || typeof orgId !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId' });
  }

  let org;
  try {
    org = await getOrg(orgId);
    if (!org) {
      const idBySlug = await getOrgIdBySlug(orgId);
      if (idBySlug) org = await getOrg(String(idBySlug));
    }
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

  const resolvedOrgId = org.id;

  if (req.method === 'GET') {
    return res.status(200).json(org);
  }

  if (req.method === 'PATCH') {
    const user = await requireOrgAdminOrOwner(req, res, resolvedOrgId);
    if (!user) return;
    const { name, metadata } = req.body || {};
    const updates = {};
    if (typeof name === 'string') updates.name = name.trim();
    if (metadata !== undefined && typeof metadata === 'object')
      updates.metadata = metadata;
    if (Object.keys(updates).length === 0) return res.status(200).json(org);
    try {
      const updated = { ...org, ...updates };
      await setOrg(updated);
      return res.status(200).json(updated);
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireOrgOwner(req, res, resolvedOrgId);
    if (!user) return;
    try {
      await deleteOrg(resolvedOrgId);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
