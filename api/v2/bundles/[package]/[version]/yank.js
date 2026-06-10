/**
 * V2 Bundle Yank API
 * POST /api/v2/bundles/:package/:version/yank  { yanked: true }   — mark unsupported
 * POST /api/v2/bundles/:package/:version/yank  { yanked: false }  — restore
 *
 * Only the package owner (same pubkey or session user) can yank/unyank.
 * Yanked versions are hidden from the version picker but the bundle manifest
 * remains accessible at GET /api/v2/bundles/:package/:version so existing
 * installs are not broken.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  getPublicKeyFromManifest,
  isAllowedOwner,
} = require('../../../../lib/verify');
const { requireAuth } = require('../../../../lib/auth-helpers');

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

let kvClient;
async function getKV() {
  if (kvClient) return kvClient;

  const isProduction = process.env.VERCEL === '1' || !!process.env.REDIS_URL;
  if (isProduction && process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', err => console.error('Redis error:', err));

    kvClient = {
      _connected: false,
      _connecting: null,
      async _ensureConnected() {
        if (this._connected) return;
        if (this._connecting) { await this._connecting; return; }
        this._connecting = redisClient.connect()
          .then(() => { this._connected = true; this._connecting = null; })
          .catch(err => { this._connected = false; this._connecting = null; throw err; });
        await this._connecting;
      },
      async get(key) { await this._ensureConnected(); return redisClient.get(key); },
      async set(key, value) { await this._ensureConnected(); return redisClient.set(key, value); },
      async del(key) { await this._ensureConnected(); return redisClient.del(key); },
    };
    return kvClient;
  }

  const mockStore = new Map();
  kvClient = {
    async get(key) { return mockStore.get(key) ?? null; },
    async set(key, value) { mockStore.set(key, value); },
    async del(key) { mockStore.delete(key); },
  };
  return kvClient;
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { package: pkg, version } = req.query;
  if (!pkg || !version) return res.status(400).json({ error: 'missing_params' });

  const body = req.body || {};
  if (typeof body.yanked !== 'boolean') {
    return res.status(400).json({ error: 'invalid_body', message: '`yanked` must be a boolean' });
  }

  // Require authenticated user
  const user = await requireAuth(req, res);
  if (!user) return; // requireAuth sends the 401 itself

  const store = getStorage();
  let existing;
  try {
    existing = await store.getBundleManifest(pkg, version);
  } catch (e) {
    return res.status(500).json({ error: 'internal_error', message: e?.message ?? String(e) });
  }
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // Allow if session user owns the package OR the request carries a valid owner pubkey
  const sigKey = body.signature ? getPublicKeyFromManifest(body) : null;
  const ownedBySig = sigKey && isAllowedOwner(existing, sigKey);
  const ownedBySession = manifestOwnedByUser(existing, user);

  if (!ownedBySig && !ownedBySession) {
    return res.status(403).json({ error: 'not_owner', message: 'Only the package owner can yank this version.' });
  }

  const kv = await getKV();
  const yankKey = `bundle-yanked:${pkg}/${version}`;

  try {
    if (body.yanked) {
      await kv.set(yankKey, '1');
    } else {
      await kv.del(yankKey);
    }
    return res.status(200).json({ package: pkg, version, yanked: body.yanked });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error', message: e?.message ?? String(e) });
  }
};
