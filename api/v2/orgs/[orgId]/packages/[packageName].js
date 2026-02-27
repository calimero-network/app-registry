/**
 * DELETE /api/v2/orgs/:orgId/packages/:packageName — unlink package (admin only)
 */

const {
  getOrg,
  getPkg2Org,
  deletePkg2Org,
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
  const packageName = req.query?.packageName;
  if (
    !orgId ||
    !packageName ||
    typeof orgId !== 'string' ||
    typeof packageName !== 'string'
  ) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing orgId or packageName',
    });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  try {
    const currentOrgId = await getPkg2Org(packageName);
    if (currentOrgId !== orgId) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Package is not linked to this organization',
      });
    }
    await deletePkg2Org(packageName);
    return res.status(204).end();
  } catch (e) {
    console.error('DELETE package error:', e);
    return res.status(500).json({
      error: 'internal',
      message: e?.message ?? String(e),
    });
  }
};
