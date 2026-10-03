/**
 * DELETE /api/v2/orgs/:orgId/packages/:packageName — unlink package (org admin or owner, package owner, or site admin)
 */

const {
  getOrg,
  getPkg2Org,
  deletePkg2Org,
  isOrgAdmin,
} = require('#api-lib/org-storage');
const { requireAuth, canManagePackage } = require('#api-lib/auth-helpers');
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');

const bundleStorage = new BundleStorageKV();

async function latestManifest(packageName) {
  const versions = await bundleStorage.getBundleVersions(packageName);
  if (!versions || versions.length === 0) return null;
  return bundleStorage.getBundleManifest(packageName, versions[0]);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  if (req.method !== 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' });

  let org;
  try {
    org = await getOrg(orgId);
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

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const allowed =
      (await isOrgAdmin(orgId, user.email)) ||
      (await canManagePackage(
        packageName,
        await latestManifest(packageName),
        user
      ));
    if (!allowed) {
      return res.status(403).json({
        error: 'forbidden',
        message:
          'Only an organization admin or owner, or the package owner, can unlink this package',
      });
    }
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
    console.error('orgs route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
