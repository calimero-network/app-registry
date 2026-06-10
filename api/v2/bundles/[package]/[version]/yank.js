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
const { requireAuth } = require('../../../../lib/auth-helpers');
const { kv } = require('../../../../lib/kv-client');

const PKG_RE = /^[\w.@/-]+$/;
const VER_RE = /^[\w.+-]+$/;

let _store;
function getStorage() {
  if (!_store) _store = new BundleStorageKV();
  return _store;
}

function manifestOwnedByUser(manifest, user) {
  const author = manifest?.metadata?.author;
  const ownerEmail = manifest?.metadata?._ownerEmail;
  if (user?.username && author === user.username) return true;
  if (user?.email && ownerEmail === user.email) return true;
  if (user?.email && !user?.username && author === user.email) return true;
  return false;
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

  const body = req.body || {};
  if (typeof body.yanked !== 'boolean') {
    return res.status(400).json({
      error: 'invalid_body',
      message: '`yanked` must be a boolean',
    });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const store = getStorage();
  let existing;
  try {
    existing = await store.getBundleManifest(pkg, version);
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'internal_error', message: e?.message ?? String(e) });
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
    return res
      .status(500)
      .json({ error: 'internal_error', message: e?.message ?? String(e) });
  }
};
