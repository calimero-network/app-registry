/**
 * One-off migration: move bundle binaries from Redis (`binary:*` hex strings)
 * into Google Cloud Storage, then drop the Redis copy to reclaim space.
 *
 * Idempotent and re-runnable:
 *   - For each `binary:*` key, upload the decoded bytes to GCS.
 *   - Verify the GCS object exists (getBinary non-null).
 *   - Only then delete the Redis key.
 * Already-migrated bundles (Redis key gone) are simply skipped.
 *
 * Usage:
 *   node scripts/migrate-binaries-to-gcs.js          # migrate + delete Redis keys
 *   node scripts/migrate-binaries-to-gcs.js --dry-run # report only, no writes
 *
 * Requires the same env as the backend: REDIS_URL + GCS_* vars.
 */

const { kv } = require('../packages/backend/src/lib/kv-client');
const blob = require('../packages/backend/src/lib/blob-store');

const DRY_RUN = process.argv.includes('--dry-run');

async function scanBinaryKeys() {
  // Prefer SCAN (non-blocking) where the client exposes it; fall back to keys().
  if (typeof kv.scan === 'function') {
    const found = [];
    let cursor = '0';
    do {
      const res = await kv.scan(cursor, { MATCH: 'binary:*', COUNT: 100 });
      // node-redis returns { cursor, keys }; some wrappers return [cursor, keys]
      const nextCursor = res.cursor ?? res[0];
      const keys = res.keys ?? res[1] ?? [];
      found.push(...keys);
      cursor = String(nextCursor);
    } while (cursor !== '0');
    return found;
  }
  if (typeof kv.keys === 'function') {
    return await kv.keys('binary:*');
  }
  throw new Error('kv client exposes neither scan() nor keys()');
}

async function main() {
  console.log(
    `Migrating bundle binaries Redis → GCS${DRY_RUN ? ' (dry run)' : ''}...`
  );

  const keys = await scanBinaryKeys();
  console.log(`Found ${keys.length} binary:* key(s) in Redis.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const redisKey of keys) {
    // `binary:{package}/{version}` → `{package}/{version}`
    const pkgVersionKey = redisKey.replace(/^binary:/, '');
    try {
      const hex = await kv.get(redisKey);
      if (!hex) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `  would migrate ${pkgVersionKey} (${hex.length / 2} bytes)`
        );
        migrated++;
        continue;
      }

      await blob.putBinary(pkgVersionKey, Buffer.from(hex, 'hex'));

      // Verify before deleting the source of truth.
      const check = await blob.getBinary(pkgVersionKey);
      if (!check) {
        throw new Error('GCS object missing after upload');
      }

      await kv.del(redisKey);
      migrated++;
      console.log(`  migrated ${pkgVersionKey}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED ${pkgVersionKey}: ${err.message}`);
    }
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Migration crashed:', err);
  process.exit(1);
});
