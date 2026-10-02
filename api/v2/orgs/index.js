/**
 * GET /api/v2/orgs — list orgs (query: member=<email> or package=<name>)
 * POST /api/v2/orgs — create org (session or Bearer token; body: name, slug)
 */

const {
  getOrg,
  setOrg,
  getOrgsByMember,
  getOrgIdsByMember,
  getOrgMemberRole,
  getPkg2Org,
  addOrgMember,
} = require('#api-lib/org-storage');
const { kv } = require('#api-lib/kv-client');
const { requireAuth } = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');
const {
  isReservedOrgSlug,
  isReservedOrgName,
  normalizeOrgName,
} = require('@calimero-network/registry-shared/org-slugs');
const {
  validateOrgName,
  countOwnedOrgs,
  MAX_OWNED_ORGS_PER_ACCOUNT,
} = require('@calimero-network/registry-shared/org-validation');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_SLUG_LENGTH = 64;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const pkg = req.query?.package;
    if (pkg && typeof pkg === 'string') {
      try {
        const orgId = await getPkg2Org(pkg.trim());
        if (!orgId) return res.status(200).json(null);
        const org = await getOrg(orgId);
        return res.status(200).json(org ?? null);
      } catch (e) {
        console.error('orgs route error:', e);
        return res
          .status(500)
          .json({ error: 'internal_error', message: 'Internal error' });
      }
    }
    const member = req.query?.member;
    if (!member || typeof member !== 'string') return res.status(200).json([]);
    const email = member.trim();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Query member must be a valid email address',
      });
    }
    // Privacy: this was an unauthenticated oracle for which orgs any email
    // belongs to. Require auth and only let a caller look up their own email
    // (case-insensitive), unless they are a site admin.
    const caller = await requireAuth(req, res);
    if (!caller) return;
    if (
      caller.email.toLowerCase() !== email.toLowerCase() &&
      !(await isAdmin(caller.email))
    ) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You may only look up organizations for your own account',
      });
    }
    try {
      const orgs = await getOrgsByMember(email);
      return res.status(200).json(orgs);
    } catch (e) {
      console.error('orgs route error:', e);
      return res
        .status(500)
        .json({ error: 'internal_error', message: 'Internal error' });
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { name, slug } = req.body || {};
    if (
      !name ||
      typeof name !== 'string' ||
      !slug ||
      typeof slug !== 'string'
    ) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Body must include name and slug (strings)',
      });
    }
    const nameError = validateOrgName(name);
    if (nameError) {
      return res.status(400).json({ error: 'bad_request', message: nameError });
    }
    const slugNorm = slug.toLowerCase().trim();
    if (!SLUG_REGEX.test(slugNorm) || slugNorm.length > MAX_SLUG_LENGTH) {
      return res.status(400).json({
        error: 'bad_request',
        message: `slug must be lowercase alphanumeric and hyphens (e.g. my-org), at most ${MAX_SLUG_LENGTH} characters`,
      });
    }
    try {
      const callerIsAdmin = await isAdmin(user.email);
      if (isReservedOrgSlug(slugNorm) && !callerIsAdmin) {
        return res.status(403).json({
          error: 'reserved_slug',
          message: 'This organization slug is reserved',
        });
      }
      if (isReservedOrgName(name) && !callerIsAdmin) {
        return res.status(403).json({
          error: 'reserved_name',
          message: 'This organization name is reserved',
        });
      }
      if (
        !callerIsAdmin &&
        (await countOwnedOrgs(
          { getOrgIdsByMember, getOrgMemberRole },
          user.email
        )) >= MAX_OWNED_ORGS_PER_ACCOUNT
      ) {
        return res.status(403).json({
          error: 'org_limit',
          message: `An account can own at most ${MAX_OWNED_ORGS_PER_ACCOUNT} organizations`,
        });
      }
      const orgId = slugNorm;
      // Reserve the slug atomically: a check-then-set let two concurrent
      // creates of the same slug both succeed, the second overwriting the
      // first org's document.
      const reserved = await kv.setNX(`org:by_slug:${slugNorm}`, orgId);
      if (!reserved || (await getOrg(orgId))) {
        return res.status(409).json({
          error: 'conflict',
          message: 'An organization with this slug already exists',
        });
      }
      const org = { id: orgId, name: normalizeOrgName(name), slug: slugNorm };
      try {
        await setOrg(org);
        await addOrgMember(orgId, user.email, 'owner');
      } catch (e) {
        await kv.del(`org:by_slug:${slugNorm}`);
        throw e;
      }
      return res.status(201).json(org);
    } catch (e) {
      console.error('orgs route error:', e);
      return res
        .status(500)
        .json({ error: 'internal_error', message: 'Internal error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
