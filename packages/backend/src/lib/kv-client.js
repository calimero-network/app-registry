/**
 * Redis Client Wrapper for Vercel Marketplace
 *
 * Provides a unified interface for Redis that works in both
 * production (Vercel Marketplace Redis) and development (mock in-memory store).
 */

const { createClient } = require('redis');

const isProduction = process.env.VERCEL === '1' || process.env.REDIS_URL;
const isDevelopment = !isProduction;

let kvClient;
let redisClient;

if (isProduction && process.env.REDIS_URL) {
  // Use real Redis from Vercel Marketplace
  redisClient = createClient({
    url: process.env.REDIS_URL,
  });

  redisClient.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('Redis error:', err);
  });

  // Wrapper to ensure connection before operations
  kvClient = {
    _connected: false,

    async _ensureConnected() {
      if (!this._connected) {
        await redisClient.connect();
        this._connected = true;
        // eslint-disable-next-line no-console
        console.log('✅ Connected to Vercel Marketplace Redis');
      }
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
     * Returns 1 if key was set, 0 if key already exists
     */
    async setNX(key, value) {
      await this._ensureConnected();
      return await redisClient.setNX(key, value);
    },

    async del(key) {
      await this._ensureConnected();
      return await redisClient.del(key);
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

    // Set operations
    async sAdd(key, ...members) {
      await this._ensureConnected();
      return await redisClient.sAdd(key, members);
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
      return await redisClient.sRem(key, members);
    },
  };
} else {
  // Mock Redis for local development using in-memory storage
  // eslint-disable-next-line no-console
  console.log('⚠️  Using Mock Redis (development mode)');

  const mockStore = new Map();
  const mockSets = new Map();
  const mockHashes = new Map();

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
     * Returns 1 if key was set, 0 if key already exists
     */
    async setNX(key, value) {
      if (mockStore.has(key)) {
        return 0; // Key already exists
      }
      mockStore.set(key, value);
      return 1; // Key was set
    },

    async del(key) {
      const existed = mockStore.has(key);
      mockStore.delete(key);
      return existed ? 1 : 0;
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

    // Set operations
    async sAdd(key, ...members) {
      if (!mockSets.has(key)) {
        mockSets.set(key, new Set());
      }
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
      let removed = 0;
      members.forEach(m => {
        if (set.delete(m)) {
          removed++;
        }
      });
      return removed;
    },

    // Utility for testing
    async _clear() {
      mockStore.clear();
      mockSets.clear();
      mockHashes.clear();
      return 'OK';
    },
  };
}

module.exports = {
  kv: kvClient,
  isDevelopment,
  isProduction,
};
