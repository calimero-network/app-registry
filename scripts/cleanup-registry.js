#!/usr/bin/env node
/**
 * Wipe the registry Redis database completely so local/manual testing can start fresh.
 *
 * Loads REDIS_URL from:
 *   1. process.env.REDIS_URL
 *   2. app-registry/.env
 *   3. app-registry/packages/backend/.env
 *
 * Run from app-registry root:
 *   pnpm run clean-registry
 * or:
 *   node scripts/cleanup-registry.js
 *
 * This uses FLUSHDB, so it deletes every key in the currently selected Redis DB.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
/* eslint-disable no-console */

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function resolveRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const root = path.resolve(__dirname, '..');
  const candidates = [
    path.join(root, '.env'),
    path.join(root, 'packages', 'backend', '.env'),
  ];

  for (const filePath of candidates) {
    const env = parseEnvFile(filePath);
    if (env.REDIS_URL) return env.REDIS_URL;
  }

  return null;
}

function redactRedisUrl(redisUrl) {
  try {
    const url = new URL(redisUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid redis url>';
  }
}

async function main() {
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    throw new Error(
      'REDIS_URL not found. Set it in the environment, app-registry/.env, or packages/backend/.env.'
    );
  }

  const client = createClient({ url: redisUrl });
  client.on('error', err => {
    console.error('Redis error:', err);
  });

  await client.connect();
  console.log('Connected to Redis');
  console.log(`Target DB: ${redactRedisUrl(redisUrl)}`);

  const beforeCount = await client.dbSize();
  console.log(`Keys before wipe: ${beforeCount}`);

  await client.flushDb();

  const afterCount = await client.dbSize();

  await client.quit();
  console.log(
    `Done. Database fully cleared. Deleted ${beforeCount} keys, ${afterCount} keys remain.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
