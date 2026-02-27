/**
 * GET /api/v2/orgs — list orgs (query: member=<pubkey> or package=<name>)
 * POST /api/v2/orgs — create org (signed; body: name, slug)
 */

const {
  getOrg,
  setOrg,
  getOrgIdBySlug,
  getOrgsByMember,
  getPkg2Org,
  addOrgMember,
} = require('../../lib/org-storage');
const { validatePublicKey } = require('../../lib/verify');
const { requireSignedRequest } = require('../../lib/signed-request');

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Pubkey, X-Signature'
  );
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
        console.error('GET /api/v2/orgs?package error:', e);
        return res.status(500).json({
          error: 'internal',
          message: e?.message ?? String(e),
        });
      }
    }
    const member = req.query?.member;
    if (!member || typeof member !== 'string') {
      return res.status(200).json([]);
    }
    const pubkey = member.trim();
    if (!validatePublicKey(pubkey)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Query member must be a valid public key',
      });
    }
    try {
      const orgs = await getOrgsByMember(pubkey);
      return res.status(200).json(orgs);
    } catch (e) {
      console.error('GET /api/v2/orgs?member error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  if (req.method === 'POST') {
    const result = await requireSignedRequest(req, res);
    if (result === null) return;
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
      const org = {
        id: orgId,
        name: name.trim(),
        slug: slugNorm,
      };
      await setOrg(org);
      await addOrgMember(orgId, result.pubkey, 'admin');
      return res.status(201).json(org);
    } catch (e) {
      console.error('POST /api/v2/orgs error:', e);
      return res.status(500).json({
        error: 'internal',
        message: e?.message ?? String(e),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
