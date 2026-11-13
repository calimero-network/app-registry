#!/usr/bin/env node
/**
 * Trim every package to its newest BUNDLE_KEEP_VERSIONS (default 5) and delete
 * bundle binaries in the bucket that no version points at any more.
 *
 * Publishing prunes its own package from now on; this clears the backlog left
 * before that, and the orphans of versions deleted before deleteBundleVersion
 * also removed the GCS object.
 *
 * Report only unless --apply is given. Run from the repo root with the
 * backend's env (REDIS_URL + GCS_*):
 *
 *   node scripts/prune-old-versions.js            # dry run
 *   node scripts/prune-old-versions.js --apply    # delete
 *   BUNDLE_KEEP_VERSIONS=3 node scripts/prune-old-versions.js
 */
/* eslint-disable no-console */

const REQUIRED_ENV = [
  'REDIS_URL',
  'GCS_BUCKET',
  'GCS_CLIENT_EMAIL',
  'GCS_PRIVATE_KEY',
];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length) {
  console.error(
    `Refusing to run: missing required env var(s): ${missing.join(', ')}.`
  );
  process.exit(1);
}

// Never print a credential: a malformed REDIS_URL fails with an error that
// carries the whole URL, password included. Only messages are printed, with
// any `user:password@` and the env secrets themselves masked.
const SECRETS = ['REDIS_URL', 'GCS_PRIVATE_KEY']
  .map(name => process.env[name])
  .filter(Boolean);
function redact(text) {
  let out = String(text).replace(/\/\/[^/@\s]+@/g, '//***@');
  for (const secret of SECRETS) out = out.split(secret).join('***');
  return out;
}

// Before anything touches Redis: the client parses REDIS_URL while it loads,
// and a crash there would otherwise print the URL.
function die(err) {
  console.error(`prune failed: ${redact(err?.message ?? err)}`);
  process.exit(1);
}
process.on('uncaughtException', die);
process.on('unhandledRejection', die);

const path = require('path');
// A backend dependency, not the root's: resolve it from there.
const { Storage } = require(
  require.resolve('@google-cloud/storage', {
    paths: [path.join(__dirname, '../packages/backend')],
  })
);
const { kv } = require('../packages/backend/src/lib/kv-client');
const {
  BundleStorageKV,
  keepVersions,
} = require('../packages/backend/src/lib/bundle-storage-kv');

const APPLY = process.argv.includes('--apply');

// A binary younger than this may belong to a publish still in flight.
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

async function main() {
  const keep = keepVersions();
  if (!keep) {
    console.error('BUNDLE_KEEP_VERSIONS=0 disables pruning; nothing to do.');
    process.exit(1);
  }
  const store = new BundleStorageKV();
  console.log(`Keeping the newest ${keep} version(s) per package.`);
  console.log(APPLY ? 'APPLYING.\n' : 'Dry run (pass --apply to delete).\n');

  // 1. Versions beyond the newest `keep`.
  const live = new Set();
  let staleCount = 0;
  for (const pkg of (await store.getAllBundles()).sort()) {
    const versions = await store.getBundleVersions(pkg);
    versions.slice(0, keep).forEach(v => live.add(`${pkg}/${v}`));
    const stale = versions.slice(keep);
    if (!stale.length) continue;
    staleCount += stale.length;
    console.log(
      `${pkg}: keep ${versions.length - stale.length}, drop ${stale.length}`
    );
    if (APPLY) {
      const deleted = await store.pruneOldVersions(pkg, keep);
      if (deleted.length !== stale.length) {
        console.warn(`  deleted ${deleted.length} of ${stale.length}`);
      }
    }
  }

  // 2. Binaries no kept version points at.
  const prefix = process.env.GCS_PREFIX || 'bundles';
  const bucket = new Storage({
    projectId: process.env.GCS_PROJECT_ID || undefined,
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
  }).bucket(process.env.GCS_BUCKET);
  const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
  const now = Date.now();
  const orphans = files.filter(f => {
    const m = f.name.match(new RegExp(`^${prefix}/(.+)\\.mpk$`));
    if (!m || live.has(m[1])) return false;
    return now - new Date(f.metadata.updated).getTime() > ORPHAN_MIN_AGE_MS;
  });
  const orphanBytes = orphans.reduce((n, f) => n + Number(f.metadata.size), 0);
  console.log(
    `\nOrphan binaries: ${orphans.length} (${(orphanBytes / 2 ** 20).toFixed(1)} MiB)`
  );
  if (APPLY) {
    for (const f of orphans) {
      await f
        .delete({ ifGenerationMatch: f.metadata.generation })
        .catch(err =>
          console.warn(`  could not delete ${f.name}: ${redact(err.message)}`)
        );
    }
  }

  console.log(
    `\n${APPLY ? 'Deleted' : 'Would delete'} ${staleCount} version(s) and ${orphans.length} orphan binar${orphans.length === 1 ? 'y' : 'ies'}.`
  );
  await kv.quit?.();
}

main().catch(die);
