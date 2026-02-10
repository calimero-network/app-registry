/**
 * V2 Bundle Listing API
 * GET /api/v2/bundles
 */

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
      async sMembers(key) {
        await this._ensureConnected();
        return await redisClient.sMembers(key);
      },
    };
    return kvClient;
  }

  // Mock for development
  const mockStore = new Map();
  const mockSets = new Map();
  kvClient = {
    async get(key) {
      return mockStore.get(key) ?? null;
    },
    async sMembers(key) {
      const set = mockSets.get(key);
      return set ? Array.from(set) : [];
    },
  };
  return kvClient;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  // Ensure every bundle includes minRuntimeVersion (default for legacy bundles)
  const normalizeBundle = bundle => {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const v = bundle.minRuntimeVersion;
    const minRuntimeVersion =
      v != null && String(v).trim() ? String(v).trim() : '0.1.0';
    return { ...bundle, minRuntimeVersion };
  };

  try {
    const semver = require('semver');
    const { package: pkg, version, developer } = req.query || {};

    if (pkg && version) {
      const data = await kv.get(`bundle:${pkg}/${version}`);
      if (!data) return res.status(404).json({ error: 'not_found' });
      const raw = JSON.parse(data).json;
      return res.status(200).json([normalizeBundle(raw)]);
    }

    const allPackages = await kv.sMembers('bundles:all');
    const bundles = [];
    for (const packageName of allPackages) {
      if (pkg && packageName !== pkg) continue;
      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (versions.length === 0) continue;
      const sorted = versions.sort((a, b) =>
        semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
      );
      const latestVersion = sorted[0];
      const data = await kv.get(`bundle:${packageName}/${latestVersion}`);
      if (!data) continue;
      const bundle = JSON.parse(data).json;
      if (developer && bundle.signature?.pubkey !== developer) continue;
      bundles.push(normalizeBundle(bundle));
    }

    bundles.sort((a, b) => a.package.localeCompare(b.package));
    return res.status(200).json(bundles);
  } catch (error) {
    console.error('List Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error?.message ?? String(error),
    });
  }
};
