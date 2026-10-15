/**
 * POST /api/v2/packages/:package/claim
 * Body: { publicKey, signature, issuedAt } signed by one of the package's
 * owner keys over the package and the caller's account email.
 *
 * Makes the calling account the package's manager on every version and drops
 * any organization link, which the previous manager made.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  claimRefusal,
} = require('@calimero-network/registry-backend/src/lib/package-claim');
const { isAllowedOwner } = require('#api-lib/verify');
const { requireAuth } = require('#api-lib/auth-helpers');
const { deletePkg2Org } = require('#api-lib/org-storage');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const pkg = String(req.query.package || '').toLowerCase();
  const store = getStorage();
  try {
    const versions = await store.getBundleVersions(pkg);
    if (!versions?.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    const latest = await store.getBundleManifest(pkg, versions[0]);
    const claim = req.body;
    if (!isAllowedOwner(latest, claim?.publicKey)) {
      return res.status(403).json({
        error: 'not_owner',
        message: 'The claim must be signed by an owner key of the package.',
      });
    }
    const refusal = await claimRefusal(claim, {
      packageName: pkg,
      account: user.email,
    });
    if (refusal) {
      return res.status(400).json({ error: 'invalid_claim', message: refusal });
    }

    for (const version of versions) {
      await store.setOwnerEmail(pkg, version, user.email.toLowerCase());
    }
    await deletePkg2Org(pkg);
    return res
      .status(200)
      .json({ package: pkg, owner: user.email.toLowerCase() });
  } catch (error) {
    if (error?.code === 'verifier_unavailable') {
      return res.status(500).json({ error: 'verifier_unavailable' });
    }
    console.error('package claim error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
};
