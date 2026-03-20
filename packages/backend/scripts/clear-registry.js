#!/usr/bin/env node
/**
 * clear-registry.js
 * Wipes ALL keys from the Redis database (bundles, users, orgs, tokens, download counts).
 * Reads REDIS_URL from .env in the backend package directory.
 *
 * Usage:
 *   node scripts/clear-registry.js
 *   node scripts/clear-registry.js --yes    # skip confirmation prompt
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('redis');
const readline = require('readline');

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('ERROR: REDIS_URL not set. Check your .env file.');
  process.exit(1);
}

async function confirm() {
  if (process.argv.includes('--yes')) return true;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(
      '\n⚠️  This will permanently delete ALL data in Redis (bundles, users, orgs, tokens, everything).\nType "yes" to continue: ',
      answer => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'yes');
      }
    );
  });
}

async function main() {
  const ok = await confirm();
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const client = createClient({ url: REDIS_URL });
  client.on('error', err => console.error('Redis error:', err));

  console.log('\nConnecting to Redis...');
  await client.connect();
  console.log('Connected.');

  // FLUSHDB wipes only the currently selected database (db 0 by default)
  await client.flushDb();

  console.log('✅ Database cleared. All keys deleted.\n');
  await client.quit();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
