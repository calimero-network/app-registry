/**
 * Redis Client Wrapper for Vercel Marketplace
 *
 * Provides a unified interface for Redis that works in both
 * production (Vercel Marketplace Redis) and development (mock in-memory store).
 *
 * ⚠️ THE ONE CLIENT. The serverless routes reach it through api/lib/kv-client.js,
 * which only re-exports this module. There used to be two implementations, so
 * a function that touched both (the bundle listing, the bundle detail route)
 * opened two Redis connections, and paid a second TLS connect on every cold
 * start before it could answer. Add a command here, not beside it.
 */

const { createClient } = require('redis');
const {
  globToRegex,
} = require('@calimero-network/registry-shared/glob-to-regex');

const {
  storageVar,
  isStorageBlocked,
  createUnavailableKv,
} = require('@calimero-network/registry-shared/storage-env');

const redisUrl = storageVar('REDIS_URL');
const isProduction = process.env.VERCEL === '1' || redisUrl;
const isDevelopment = !isProduction;

let kvClient;
let redisClient;

if (isStorageBlocked()) {
  // eslint-disable-next-line no-console
  console.error(
    `Storage disabled: VERCEL_ENV=${process.env.VERCEL_ENV} and PREVIEW_REDIS_URL is not set`
  );
  kvClient = createUnavailableKv();
} else if (isProduction && redisUrl) {
  // Use real Redis from Vercel Marketplace
  redisClient = createClient({
    url: redisUrl,
  });

  redisClient.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('Redis error:', err);
  });

  // Wrapper to ensure connection before operations
  kvClient = {
    _connected: false,
    _connectingPromise: null,

    async _ensureConnected() {
      if (this._connected && redisClient.isReady) return;
      if (this._connectingPromise) {
        await this._connectingPromise;
        return;
      }
      // If socket is open but not ready (e.g. after a timeout), force-close it first
      if (redisClient.isOpen) {
        await redisClient.quit().catch(() => {});
        this._connected = false;
      }
      this._connectingPromise = redisClient
        .connect()
        .then(() => {
          this._connected = true;
          this._connectingPromise = null;
          // eslint-disable-next-line no-console
          console.log('✅ Connected to Vercel Marketplace Redis');
        })
        .catch(err => {
          this._connectingPromise = null;
          this._connected = false;
          throw err;
        });
      await this._connectingPromise;
    },

    // String operations
    async get(key) {
      await this._ensureConnected();
      return await redisClient.get(key);
    },

    async set(key, value) {
      await this._ensureConnected();
      return await redisClient.set(key, value);
    },

    /**
     * Atomic SET if Not eXists (SETNX)
     * Returns boolean: true if key was set, false if key already exists
     * (node-redis v4+ returns boolean, not integer)
     */
    async setNX(key, value) {
      await this._ensureConnected();
      return await redisClient.setNX(key, value);
    },

    async mGet(keys) {
      await this._ensureConnected();
      return keys.length ? await redisClient.mGet(keys) : [];
    },

    /**
     * SET key value NX EX ttlSeconds — set only if absent, expiring after
     * `ttlSeconds`. Returns true if the key was set, false if it already
     * existed.
     */
    async setNXEx(key, value, ttlSeconds) {
      await this._ensureConnected();
      const reply = await redisClient.set(key, value, {
        NX: true,
        EX: ttlSeconds,
      });
      return reply === 'OK';
    },

    async del(key) {
      await this._ensureConnected();
      return await redisClient.del(key);
    },

    async incr(key) {
      await this._ensureConnected();
      return await redisClient.incr(key);
    },

    async setXX(key, value) {
      await this._ensureConnected();
      const reply = await redisClient.set(key, value, {
        XX: true,
        KEEPTTL: true,
      });
      return reply === 'OK';
    },

    // Hash operations
    async hSet(key, obj) {
      await this._ensureConnected();
      return await redisClient.hSet(key, obj);
    },

    async hGetAll(key) {
      await this._ensureConnected();
      return await redisClient.hGetAll(key);
    },

    async hGet(key, field) {
      await this._ensureConnected();
      return await redisClient.hGet(key, field);
    },

    async hDel(key, ...fields) {
      await this._ensureConnected();
      return await redisClient.hDel(key, ...fields);
    },

    // List operations — the per-org audit log is an append-only list.
    async rPush(key, ...values) {
      await this._ensureConnected();
      const list = values.flat().map(v => String(v));
      return list.length ? await redisClient.rPush(key, list) : 0;
    },

    async lRange(key, start, stop) {
      await this._ensureConnected();
      return await redisClient.lRange(key, start, stop);
    },

    async lLen(key) {
      await this._ensureConnected();
      return await redisClient.lLen(key);
    },

    // Set operations (node-redis expects members as variadic args, not a single array)
    async sAdd(key, ...members) {
      await this._ensureConnected();
      const list = members
        .flat()
        .map(m => (Buffer.isBuffer(m) ? m : String(m)));
      return list.length ? await redisClient.sAdd(key, ...list) : 0;
    },

    async sMembers(key) {
      await this._ensureConnected();
      return await redisClient.sMembers(key);
    },

    async sIsMember(key, member) {
      await this._ensureConnected();
      return await redisClient.sIsMember(key, member);
    },

    async sRem(key, ...members) {
      await this._ensureConnected();
      const list = members
        .flat()
        .map(m => (Buffer.isBuffer(m) ? m : String(m)));
      return list.length ? await redisClient.sRem(key, ...list) : 0;
    },

    /** Non-blocking SCAN — do not add KEYS; it blocks Redis on large datasets. */
    async scanKeys(pattern) {
      await this._ensureConnected();
      const result = [];
      // node-redis v5+ scanIterator may yield a batch (array of keys) per iteration, not one key.
      for await (const chunk of redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 500,
      })) {
        const keys = Array.isArray(chunk) ? chunk : [chunk];
        for (const key of keys) {
          if (key == null) continue;
          const k =
            typeof key === 'string'
              ? key
              : Buffer.isBuffer(key)
                ? key.toString('utf8')
                : String(key);
          result.push(k);
        }
      }
      return result;
    },
  };
} else {
  // Mock Redis for local development using in-memory storage
  // eslint-disable-next-line no-console
  console.log('⚠️  Using Mock Redis (development mode)');

  const mockStore = new Map();
  const mockSets = new Map();
  const mockHashes = new Map();
  const mockExpiry = new Map();
  const mockLists = new Map();

  kvClient = {
    // String operations
    async get(key) {
      const value = mockStore.get(key);
      return value !== undefined ? value : null;
    },

    async set(key, value) {
      mockStore.set(key, value);
      return 'OK';
    },

    /**
     * Atomic SET if Not eXists (SETNX) for mock
     * Returns boolean: true if key was set, false if key already exists
     * (matches node-redis v4+ behavior)
     */
    async setNX(key, value) {
      if (mockStore.has(key)) {
        return false; // Key already exists
      }
      mockStore.set(key, value);
      return true; // Key was set
    },

    async mGet(keys) {
      return keys.map(key => {
        const value = mockStore.get(key);
        return value !== undefined ? value : null;
      });
    },

    async setNXEx(key, value, ttlSeconds) {
      const expiresAt = mockExpiry.get(key);
      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        mockStore.delete(key);
        mockExpiry.delete(key);
      }
      if (mockStore.has(key)) return false;
      mockStore.set(key, value);
      mockExpiry.set(key, Date.now() + ttlSeconds * 1000);
      return true;
    },

    async del(key) {
      const existed = mockStore.has(key);
      mockStore.delete(key);
      mockExpiry.delete(key);
      return existed ? 1 : 0;
    },

    async incr(key) {
      const current = parseInt(mockStore.get(key) || '0', 10);
      const next = current + 1;
      mockStore.set(key, String(next));
      return next;
    },

    async setXX(key, value) {
      if (!mockStore.has(key)) return false;
      mockStore.set(key, value);
      return true;
    },

    // Hash operations
    async hSet(key, obj) {
      mockHashes.set(key, obj);
      return Object.keys(obj).length;
    },

    async hGetAll(key) {
      const data = mockHashes.get(key);
      return data || {};
    },

    async hGet(key, field) {
      const data = mockHashes.get(key);
      return data ? data[field] : null;
    },

    async hDel(key, ...fields) {
      const data = mockHashes.get(key);
      if (!data) return 0;
      let removed = 0;
      fields.forEach(f => {
        if (data[f] !== undefined) {
          delete data[f];
          removed++;
        }
      });
      return removed;
    },

    // List operations
    async rPush(key, ...values) {
      if (!mockLists.has(key)) mockLists.set(key, []);
      const list = mockLists.get(key);
      values.flat().forEach(v => list.push(String(v)));
      return list.length;
    },

    async lRange(key, start, stop) {
      const list = mockLists.get(key) || [];
      const len = list.length;
      const from = start < 0 ? Math.max(len + start, 0) : start;
      const to = stop < 0 ? len + stop : Math.min(stop, len - 1);
      return to < from ? [] : list.slice(from, to + 1);
    },

    async lLen(key) {
      return (mockLists.get(key) || []).length;
    },

    // Set operations
    async sAdd(key, ...members) {
      const list = members.flat().map(m => String(m));
      if (!mockSets.has(key)) {
        mockSets.set(key, new Set());
      }
      const set = mockSets.get(key);
      let added = 0;
      list.forEach(m => {
        if (!set.has(m)) {
          set.add(m);
          added++;
        }
      });
      return added;
    },

    async sMembers(key) {
      const set = mockSets.get(key);
      return set ? Array.from(set) : [];
    },

    async sIsMember(key, member) {
      const set = mockSets.get(key);
      return set && set.has(member) ? 1 : 0;
    },

    async sRem(key, ...members) {
      const set = mockSets.get(key);
      if (!set) return 0;
      const list = members.flat().map(m => String(m));
      let removed = 0;
      list.forEach(m => {
        if (set.delete(m)) {
          removed++;
        }
      });
      return removed;
    },

    async scanKeys(pattern) {
      const regex = globToRegex(pattern);
      const allKeys = new Set([
        ...mockStore.keys(),
        ...mockSets.keys(),
        ...mockHashes.keys(),
      ]);
      return [...allKeys].filter(k => regex.test(k));
    },

    // Utility for testing
    async _clear() {
      mockStore.clear();
      mockSets.clear();
      mockHashes.clear();
      mockExpiry.clear();
      mockLists.clear();
      return 'OK';
    },
  };
}

module.exports = {
  kv: kvClient,
  isDevelopment,
  isProduction,
};
