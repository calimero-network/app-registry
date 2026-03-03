/**
 * GET  /api/v2/orgs/:orgId/packages — list packages linked to org (public)
 * POST /api/v2/orgs/:orgId/packages — link package to org (admin/owner; must be package author)
 */

const {
  getOrg,
  getPackagesByOrg,
  setPkg2Org,
} = require('../../../../lib/org-storage');
const { requireOrgAdminOrOwner } = require('../../../../lib/auth-helpers');
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');

const bundleStorage = new BundleStorageKV();

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
      const packages = await getPackagesByOrg(orgId);
      return res.status(200).json({ packages });
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  if (req.method === 'POST') {
    const user = await requireOrgAdminOrOwner(req, res, orgId);
    if (!user) return;

    const pkg = req.body?.package;
    if (!pkg || typeof pkg !== 'string') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Body must include package (string)',
      });
    }
    const pkgName = pkg.trim();
    if (!pkgName) {
      return res
        .status(400)
        .json({ error: 'bad_request', message: 'package cannot be empty' });
    }

    try {
      const versions = await bundleStorage.getBundleVersions(pkgName);
      if (!versions || versions.length === 0) {
        return res.status(404).json({
          error: 'not_found',
          message: `Package '${pkgName}' does not exist in the registry`,
        });
      }
      const latestManifest = await bundleStorage.getBundleManifest(
        pkgName,
        versions[0]
      );
      const packageAuthor = latestManifest?.metadata?.author;
      if (!packageAuthor || packageAuthor !== user.email) {
        return res.status(403).json({
          error: 'forbidden',
          message: `You do not own package '${pkgName}'. Only the package author can link it to an organization`,
        });
      }
      await setPkg2Org(pkgName, orgId);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
