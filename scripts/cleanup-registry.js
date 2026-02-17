#!/usr/bin/env node
/**
 * Clean up all registry data from Redis (same Redis as app-registry backend).
 *
 * Loads REDIS_URL from app-registry root .env or packages/backend/.env.
 * Run from app-registry root: pnpm run clean-registry  (or node scripts/cleanup-registry.js)
 *
 * Deletes:
 *   bundle:*, binary:*, bundle-versions:*, provides:*, uses:*, bundles:all
 */

const { createClient } = require('redis');

const PATTERNS = [
  'bundle:*',
  'binary:*',
  'bundle-versions:*',
  'provides:*',
  'uses:*',
];
const SINGLE_KEYS = ['bundles:all'];

async function main() {
  const client = createClient({
    url: 'redis://default:6NJB22CPkmhy0AsULTF6Lro8rwHHfvlq@redis-14502.c300.eu-central-1-1.ec2.redns.redis-cloud.com:14502',
  });
  client.on('error', err => {
    console.error('Redis error:', err);
  });

  await client.connect();
  console.log('Connected to Redis');

  let totalDeleted = 0;

  for (const pattern of PATTERNS) {
    let count = 0;
    for await (const key of client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      await client.del(key);
      count++;
    }
    console.log(`Deleted ${count} keys matching ${pattern}`);
    totalDeleted += count;
  }

  for (const key of SINGLE_KEYS) {
    const n = await client.del(key);
    if (n > 0) {
      console.log(`Deleted key: ${key}`);
      totalDeleted += n;
    }
  }

  await client.quit();
  console.log(`Done. Total keys deleted: ${totalDeleted}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
