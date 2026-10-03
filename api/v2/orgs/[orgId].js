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
} = require('#api-lib/org-storage');
const {
  requireOrgAdminOrOwner,
  requireOrgOwner,
} = require('#api-lib/auth-helpers');
const { isAdmin, setAdminVerified } = require('#api-lib/admin-storage');
const {
  validateOrgName,
  validateOrgMetadata,
} = require('@calimero-network/registry-shared/org-validation');
const {
  isReservedOrgName,
  normalizeOrgName,
} = require('@calimero-network/registry-shared/org-slugs');
const {
  TRUSTED_ORG_SLUGS,
} = require('@calimero-network/registry-shared/package-review');

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

  const resolvedOrgId = org.id;

  if (req.method === 'GET') {
    return res.status(200).json(org);
  }

  if (req.method === 'PATCH') {
    const user = await requireOrgAdminOrOwner(req, res, resolvedOrgId);
    if (!user) return;
    const { name, metadata } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      const nameError = validateOrgName(name);
      if (nameError) {
        return res
          .status(400)
          .json({ error: 'bad_request', message: nameError });
      }
      const nameNorm = normalizeOrgName(name);
      if (
        nameNorm !== org.name &&
        isReservedOrgName(nameNorm) &&
        !TRUSTED_ORG_SLUGS.includes(org.slug) &&
        !(await isAdmin(user.email))
      ) {
        return res.status(403).json({
          error: 'reserved_name',
          message: 'This organization name is reserved',
        });
      }
      updates.name = nameNorm;
    }
    if (metadata !== undefined) {
      // Allowlisted keys, bounded lengths, http(s)-only links (the frontend
      // renders website/github/twitter as raw hrefs), a valid email.
      const checked = validateOrgMetadata(metadata);
      if (checked.error) {
        return res
          .status(400)
          .json({ error: 'invalid_metadata', message: checked.error });
      }
      updates.metadata = checked.value;
    }
    if (Object.keys(updates).length === 0) return res.status(200).json(org);
    try {
      const updated = { ...org, ...updates };
      await setOrg(updated);
      return res.status(200).json(updated);
    } catch (e) {
      console.error('orgs route error:', e);
      return res
        .status(500)
        .json({ error: 'internal_error', message: 'Internal error' });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireOrgOwner(req, res, resolvedOrgId);
    if (!user) return;
    try {
      await deleteOrg(resolvedOrgId);
      // The slug is free again once the org is gone; a new org created under
      // it must not inherit the old one's admin verification.
      await setAdminVerified('org', resolvedOrgId, false);
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
