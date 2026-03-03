/**
 * GET /api/v2/orgs — list orgs (query: member=<email> or package=<name>)
 * POST /api/v2/orgs — create org (session or Bearer token; body: name, slug)
 */

const {
  getOrg,
  setOrg,
  getOrgIdBySlug,
  getOrgsByMember,
  getPkg2Org,
  addOrgMember,
} = require('../../lib/org-storage');
const { requireAuth } = require('../../lib/auth-helpers');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

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
        return res
          .status(500)
          .json({ error: 'internal', message: e?.message ?? String(e) });
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
    try {
      const orgs = await getOrgsByMember(email);
      return res.status(200).json(orgs);
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
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
    const slugNorm = slug.toLowerCase().trim();
    if (!SLUG_REGEX.test(slugNorm)) {
      return res.status(400).json({
        error: 'bad_request',
        message:
          'slug must be lowercase alphanumeric and hyphens (e.g. my-org)',
      });
    }
    try {
      const existingId = await getOrgIdBySlug(slugNorm);
      if (existingId) {
        return res.status(409).json({
          error: 'conflict',
          message: 'An organization with this slug already exists',
        });
      }
      const orgId = slugNorm;
      const org = { id: orgId, name: name.trim(), slug: slugNorm };
      await setOrg(org);
      await addOrgMember(orgId, user.email, 'owner');
      return res.status(201).json(org);
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
