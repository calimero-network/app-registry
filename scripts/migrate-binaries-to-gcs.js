/**
 * One-off migration: move bundle binaries from Redis (`binary:*` hex strings)
 * into Google Cloud Storage, then drop the Redis copy to reclaim space.
 *
 * Idempotent and re-runnable:
 *   - For each `binary:*` key, upload the decoded bytes to GCS.
 *   - Verify the GCS object exists AND its byte length matches the source.
 *   - Only then delete the Redis key.
 * Already-migrated bundles (Redis key gone) are simply skipped.
 *
 * Run from the repo root so the relative requires below resolve:
 *   node scripts/migrate-binaries-to-gcs.js          # migrate + delete Redis keys
 *   node scripts/migrate-binaries-to-gcs.js --dry-run # report only, no writes
 *
 * Requires the same env as the backend: REDIS_URL + GCS_* vars (validated below).
 */

// Fail loudly if required env is missing — these modules read process.env on
// load, and a missing var could otherwise point at the wrong Redis/GCS silently.
const REQUIRED_ENV = [
  'REDIS_URL',
  'GCS_BUCKET',
  'GCS_CLIENT_EMAIL',
  'GCS_PRIVATE_KEY',
];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length) {
  console.error(
    `Refusing to run: missing required env var(s): ${missing.join(', ')}.\n` +
      'Set them (e.g. via packages/backend/.env) and re-run from the repo root.'
  );
  process.exit(1);
}

const { kv } = require('../packages/backend/src/lib/kv-client');
const blob = require('../packages/backend/src/lib/blob-store');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(
    `Migrating bundle binaries Redis → GCS${DRY_RUN ? ' (dry run)' : ''}...`
  );

  // The backend Redis wrapper exposes scanKeys(pattern) -> string[] of keys.
  const keys = await kv.scanKeys('binary:*');
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

      const buf = Buffer.from(hex, 'hex');
      await blob.putBinary(pkgVersionKey, buf);

      // Verify before deleting the source of truth: object must exist AND its
      // byte length must match, so a partial/corrupt upload can't cause data loss.
      const check = await blob.getBinary(pkgVersionKey);
      if (!check) {
        throw new Error('GCS object missing after upload');
      }
      if (check.length !== buf.length) {
        throw new Error(
          `GCS content length mismatch (expected ${buf.length}, got ${check.length})`
        );
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
