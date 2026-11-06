/**
 * One-off migration: rewrite every stored manifest whose icon is still inline,
 * so the icon is kept once per distinct image (see
 * packages/backend/src/lib/icon-dedup.js). Reads return the same manifests
 * before and after.
 *
 * Idempotent and re-runnable; a version already rewritten is skipped. It uses
 * SET XX, so a version deleted while this runs is not brought back. Do not run
 * it at the same time as another bulk write or delete of `bundle:` keys.
 *
 * Run from the repo root, after the icon-dedup change is deployed:
 *   node scripts/dedupe-bundle-icons.js --dry-run   # report only
 *   node scripts/dedupe-bundle-icons.js
 *
 * Requires REDIS_URL.
 */

if (!process.env.REDIS_URL) {
  console.error('Refusing to run: REDIS_URL is not set.');
  process.exit(1);
}

const { kv } = require('../packages/backend/src/lib/kv-client');

const DRY_RUN = process.argv.includes('--dry-run');
// The client without the icon layer, to see what is actually stored.
const raw = Object.getPrototypeOf(kv);

async function main() {
  const keys = (await kv.scanKeys('bundle:*')).filter(k =>
    /^bundle:[^/]+\/.+/.test(k)
  );
  console.log(
    `${keys.length} manifest(s)${DRY_RUN ? ' (dry run, nothing written)' : ''}`
  );

  let rewritten = 0;
  let skipped = 0;
  let failed = 0;
  let freed = 0;
  const icons = new Set();

  for (const key of keys) {
    try {
      const stored = await raw.get.call(kv, key);
      const icon = stored && JSON.parse(stored)?.json?.metadata?.icon;
      if (typeof icon !== 'string' || !icon.startsWith('data:')) {
        skipped++;
        continue;
      }
      freed += icon.length;
      icons.add(icon);
      if (!DRY_RUN) {
        // Hydrated read, then a write the icon layer stores by reference.
        const value = await kv.get(key);
        if (value && !(await kv.setXX(key, value))) {
          skipped++;
          continue;
        }
      }
      rewritten++;
    } catch (err) {
      failed++;
      console.error(`  ${key}: ${err.message}`);
    }
  }

  for (const icon of icons) freed -= icon.length; // one copy of each stays
  console.log(
    `${DRY_RUN ? 'would rewrite' : 'rewrote'} ${rewritten}, skipped ${skipped}, failed ${failed}; ` +
      `${icons.size} distinct icon(s); ~${(freed / 1048576).toFixed(1)} MB freed`
  );
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
