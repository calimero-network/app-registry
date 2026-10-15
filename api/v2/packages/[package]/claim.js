/**
 * POST /api/v2/packages/:package/claim with { publicKey, signature, issuedAt }:
 * a key holder makes their account the manager and author, dropping any org link.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  applyClaim,
} = require('@calimero-network/registry-backend/src/lib/package-claim');
const { requireAuth } = require('#api-lib/auth-helpers');
const { deletePkg2Org } = require('#api-lib/org-storage');
const { getUserByEmail } = require('#api-lib/user-storage');
const { registryOrigin } = require('#api-lib/request-origin');

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

  try {
    const result = await applyClaim({
      store: getStorage(),
      packageName: String(req.query.package || '').toLowerCase(),
      claim: req.body,
      email: user.email,
      username: (await getUserByEmail(user.email))?.username ?? null,
      registry: registryOrigin(),
      unlinkOrg: deletePkg2Org,
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error?.code === 'verifier_unavailable') {
      return res.status(500).json({ error: 'verifier_unavailable' });
    }
    console.error('package claim error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
};
