/**
 * V2 Bundle Yank API
 * POST /api/v2/bundles/:package/:version/yank  { yanked: true }   — mark unsupported
 * POST /api/v2/bundles/:package/:version/yank  { yanked: false }  — restore
 *
 * Only the package owner (session user) can yank/unyank.
 * Yanked versions remain accessible at GET /api/v2/bundles/:package/:version
 * so existing installs are not broken.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  requireAuth,
  manifestOwnedByUser,
} = require('../../../../lib/auth-helpers');
const { kv } = require('../../../../lib/kv-client');

// Scoped packages (@org/name) are allowed; bare path traversal sequences are not.
const PKG_RE = /^(?:@[\w.-]+\/)?[\w.+-]+$/;
// Block repeated dots (e.g. `..`) in addition to the character allowlist.
const VER_RE = /^(?!.*\.{2})[\w.+-]+$/;

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

  const user = await requireAuth(req, res);
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

  if (!manifestOwnedByUser(existing, user)) {
    return res.status(403).json({
      error: 'not_owner',
      message: 'Only the package owner can yank this version.',
    });
  }

  const yankKey = `bundle-yanked:${pkg}/${version}`;

  try {
    if (body.yanked) {
      await kv.set(yankKey, '1');
    } else {
      await kv.del(yankKey);
    }
    return res.status(200).json({ package: pkg, version, yanked: body.yanked });
  } catch (e) {
    console.error('yank: KV write failed', e);
    return res.status(500).json({ error: 'internal_error' });
  }
};
