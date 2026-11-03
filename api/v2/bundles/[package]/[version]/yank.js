/**
 * V2 Bundle Yank API
 * POST /api/v2/bundles/:package/:version/yank  { yanked: true }   — mark unsupported
 * POST /api/v2/bundles/:package/:version/yank  { yanked: false }  — restore
 *
 * The package author, an admin or owner of the organization the package belongs
 * to, or a site admin can yank/unyank.
 * Yanked versions remain accessible at GET /api/v2/bundles/:package/:version
 * so existing installs are not broken.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  requireAuth,
  canManagePackage,
  NOT_OWNER_MESSAGE,
} = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const { packageOrgId, isPrivatePackage } = require('#api-lib/package-records');
const { appendAudit } = require('#api-lib/org-audit');

// Scoped packages (@org/name) are allowed; bare path traversal sequences are not.
const PKG_RE = /^(?:@[\w.-]+\/)?[\w.+-]+$/;
// Must start with a word char; block consecutive dots; allow semver + pre-release/build.
const VER_RE = /^\w(?!.*\.{2})[\w.+-]*$/;

let _store;
function getStorage() {
  if (!_store) _store = new BundleStorageKV();
  return _store;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { package: pkg, version } = req.query;
  if (!pkg || !version)
    return res.status(400).json({ error: 'missing_params' });
  if (!PKG_RE.test(pkg) || !VER_RE.test(version)) {
    return res.status(400).json({
      error: 'invalid_params',
      message: 'package or version contains disallowed characters',
    });
  }

  const user = await requireAuth(req, res, { allowCloud: true });
  if (!user) return;

  const body = req.body || {};
  if (typeof body.yanked !== 'boolean') {
    return res.status(400).json({
      error: 'invalid_body',
      message: '`yanked` must be a boolean',
    });
  }

  const store = getStorage();
  let existing;
  try {
    existing = await store.getBundleManifest(pkg, version);
  } catch (e) {
    console.error('yank: getBundleManifest failed', e);
    return res.status(500).json({ error: 'internal_error' });
  }
  if (!existing) return res.status(404).json({ error: 'not_found' });

  if (!(await canManagePackage(pkg, existing, user))) {
    // A private package is not confirmed to someone who may not manage it.
    if (await isPrivatePackage(pkg)) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.status(403).json({
      error: 'not_owner',
      message: NOT_OWNER_MESSAGE,
    });
  }

  const yankKey = `bundle-yanked:${pkg}/${version}`;

  try {
    if (body.yanked) {
      await kv.set(yankKey, '1');
    } else {
      await kv.del(yankKey);
    }
    await appendAudit(await packageOrgId(pkg).catch(() => null), {
      type: body.yanked ? 'yank' : 'unyank',
      package: pkg,
      version,
      user,
    });
    return res.status(200).json({ package: pkg, version, yanked: body.yanked });
  } catch (e) {
    console.error('yank: KV write failed', e);
    return res.status(500).json({ error: 'internal_error' });
  }
};
