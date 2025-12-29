/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
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
        this._connecting = redisClient.connect().then(() => {
          this._connected = true;
          this._connecting = null;
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

  try {
    const { package: pkg, version } = req.query;
    if (!pkg || !version)
      return res.status(400).json({ error: 'missing_params' });

    const data = await kv.get(`bundle:${pkg}/${version}`);
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(JSON.parse(data).json);
  } catch (error) {
    console.error('Get Error:', error);
    return res
      .status(500)
      .json({
        error: 'internal_error',
        message: error?.message ?? String(error),
      });
  }
};
