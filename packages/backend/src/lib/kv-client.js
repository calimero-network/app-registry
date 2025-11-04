/**
 * Vercel KV Client Wrapper
 *
 * Provides a unified interface for Vercel KV that works in both
 * production (real Vercel KV) and development (mock in-memory store).
 */

const isProduction = process.env.VERCEL === '1';
const isDevelopment = !isProduction;

let kvClient;

if (isProduction) {
  // Use real Vercel KV in production
  const { kv } = require('@vercel/kv');
  kvClient = kv;
  // eslint-disable-next-line no-console
  console.log('✅ Using Vercel KV (production)');
} else {
  // Mock KV for local development using in-memory storage
  // eslint-disable-next-line no-console
  console.log('⚠️  Using Mock KV (development mode)');

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
      // Ignore TTL options in mock
      return 'OK';
    },

    async del(key) {
      const existed = mockStore.has(key);
      mockStore.delete(key);
      return existed ? 1 : 0;
    },

    // Hash operations
    async hset(key, obj) {
      mockHashes.set(key, obj);
      return Object.keys(obj).length;
    },

    async hgetall(key) {
      const data = mockHashes.get(key);
      return data || {};
    },

    async hget(key, field) {
      const data = mockHashes.get(key);
      return data ? data[field] : null;
    },

    // Set operations
    async sadd(key, ...members) {
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

    async smembers(key) {
      const set = mockSets.get(key);
      return set ? Array.from(set) : [];
    },

    async sismember(key, member) {
      const set = mockSets.get(key);
      return set && set.has(member) ? 1 : 0;
    },

    async srem(key, ...members) {
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
