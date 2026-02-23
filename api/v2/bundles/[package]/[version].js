/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 * PATCH /api/v2/bundles/:package/:version - edit metadata (body = full manifest; ownership + signature checks)
 */

const {
  BundleStorageKV,
} = require('../../../../packages/backend/src/lib/bundle-storage-kv');
const {
  validateBundleManifest,
} = require('../../../../packages/backend/src/lib/v2-utils');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  isAllowedOwner,
} = require('../../../../packages/backend/src/lib/verify');

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
        if (this._connecting) {
          await this._connecting;
          return;
        }
        this._connecting = redisClient
          .connect()
          .then(() => {
            this._connected = true;
            this._connecting = null;
          })
          .catch(error => {
            this._connected = false;
            this._connecting = null;
            throw error;
          });
        await this._connecting;
      },
      async get(key) {
        await this._ensureConnected();
        return await redisClient.get(key);
      },
    };
    return kvClient;
  }

  // Mock for development
  const mockStore = new Map();
  kvClient = {
    async get(key) {
      return mockStore.get(key) ?? null;
    },
  };
  return kvClient;
}

async function handlePatch(req, res, pkg, version) {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'Missing body',
    });
  }
  if (body.package !== pkg || body.appVersion !== version) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'Body package and appVersion must match URL',
    });
  }

  const { valid, errors } = validateBundleManifest(body);
  if (!valid) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: errors?.join('; ') ?? 'Validation failed',
    });
  }

  try {
    await verifyManifest(body);
  } catch (err) {
    return res.status(400).json({
      error: 'invalid_signature',
      message: err.message || 'Signature verification failed',
    });
  }

  const store = getStorage();
  let existing;
  try {
    existing = await store.getBundleManifest(pkg, version);
  } catch (e) {
    console.error('PATCH getBundleManifest:', e);
    return res.status(500).json({
      error: 'internal_error',
      message: e?.message ?? String(e),
    });
  }
  if (!existing) {
    return res.status(404).json({ error: 'not_found' });
  }

  const incomingKey = getPublicKeyFromManifest(body);
  if (!isAllowedOwner(existing, incomingKey)) {
    return res.status(403).json({
      error: 'not_owner',
      message: 'Only the package owner can edit this version.',
    });
  }

  if (
    !body.wasm ||
    body.wasm.hash !== existing.wasm?.hash ||
    body.wasm.path !== existing.wasm?.path ||
    body.wasm.size !== existing.wasm?.size
  ) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'wasm (path, hash, size) cannot be changed via PATCH',
    });
  }

  try {
    await store.storeBundleManifest(body, true);
    return res.status(200).json({
      message: 'Bundle metadata updated',
      package: pkg,
      version,
    });
  } catch (error) {
    console.error('PATCH store Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { package: pkg, version } = req.query;
  if (!pkg || !version) {
    return res.status(400).json({ error: 'missing_params' });
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, pkg, version);
  }

  let kv;
  try {
    kv = await getKV();
  } catch (e) {
    console.error('KV init failed:', e);
    return res.status(500).json({
      error: 'kv_init_failed',
      message: e?.message ?? String(e),
    });
  }

  // Ensure bundle includes minRuntimeVersion (default for legacy bundles)
  const normalizeBundle = bundle => {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const v = bundle.min_runtime_version;
    const min_runtime_version =
      v != null && String(v).trim() ? String(v).trim() : '0.1.0';
    return { ...bundle, min_runtime_version };
  };

  try {
    const data = await kv.get(`bundle:${pkg}/${version}`);
    if (!data) return res.status(404).json({ error: 'not_found' });
    const raw = JSON.parse(data).json;
    return res.status(200).json(normalizeBundle(raw));
  } catch (error) {
    console.error('Get Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
