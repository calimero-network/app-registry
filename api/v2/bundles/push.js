/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 */

// Inline kv-client to avoid Vercel require resolution issues
let kvClient;
function getKV() {
  if (!kvClient) {
    const { createClient } = require('redis');
    const isProduction = process.env.VERCEL === '1' || process.env.REDIS_URL;
    
    if (isProduction && process.env.REDIS_URL) {
      const redisClient = createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', err => console.error('Redis error:', err));
      
      kvClient = {
        _connected: false,
        async _ensureConnected() {
          if (!this._connected) {
            await redisClient.connect();
            this._connected = true;
          }
        },
        async get(key) {
          await this._ensureConnected();
          return await redisClient.get(key);
        },
        async set(key, value) {
          await this._ensureConnected();
          return await redisClient.set(key, value);
        },
        async setNX(key, value) {
          await this._ensureConnected();
          return await redisClient.setNX(key, value);
        },
        async sAdd(key, ...members) {
          await this._ensureConnected();
          return await redisClient.sAdd(key, members);
        },
      };
    } else {
      // Mock for development
      const mockStore = new Map();
      const mockSets = new Map();
      kvClient = {
        async get(key) {
          return mockStore.get(key) || null;
        },
        async set(key, value) {
          mockStore.set(key, value);
          return 'OK';
        },
        async setNX(key, value) {
          if (mockStore.has(key)) return false;
          mockStore.set(key, value);
          return true;
        },
        async sAdd(key, ...members) {
          if (!mockSets.has(key)) mockSets.set(key, new Set());
          const set = mockSets.get(key);
          let added = 0;
          members.forEach(m => {
            if (!set.has(m)) {
              set.add(m);
              added++;
            }
          });
          return added;
        },
      };
    }
  }
  return kvClient;
}

module.exports = async (req, res) => {
  const kv = getKV();

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bundleManifest = req.body;

    if (!bundleManifest || !bundleManifest.package || !bundleManifest.appVersion) {
      return res.status(400).json({ 
        error: 'invalid_manifest', 
        message: 'Missing required fields: package, appVersion' 
      });
    }

    const key = `${bundleManifest.package}/${bundleManifest.appVersion}`;
    const overwrite = bundleManifest._overwrite === true;

    // Optimized Binary Storage
    const binary = bundleManifest._binary;
    const cleanManifest = { ...bundleManifest };
    delete cleanManifest._binary;
    delete cleanManifest._overwrite;
    
    const manifestData = {
      json: cleanManifest,
      created_at: new Date().toISOString(),
    };

    if (overwrite) {
      await kv.set(`bundle:${key}`, JSON.stringify(manifestData));
    } else {
      const wasSet = await kv.setNX(`bundle:${key}`, JSON.stringify(manifestData));
      if (!wasSet || wasSet === 0) {
        return res.status(409).json({ error: 'bundle_exists' });
      }
    }

    await kv.sAdd(`bundle-versions:${bundleManifest.package}`, bundleManifest.appVersion);
    await kv.sAdd('bundles:all', bundleManifest.package);
    if (binary) {
      await kv.set(`binary:${key}`, binary);
    }

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res.status(500).json({ error: 'internal_error', message: error.message });
  }
};
