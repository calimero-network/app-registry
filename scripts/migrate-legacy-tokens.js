/**
 * One-off migration: re-key legacy API tokens (`apitoken:<raw token>`, no
 * expiry) to the hashed form (`apitoken:<sha256 hex>`) with an expiresAt, and
 * give any hashed record that lacks an expiry one.
 *
 * Only records listed in their owner's `user_tokens:<email>` set are migrated.
 * Any other record is reported as an orphan and left for the cutoff, or
 * deleted with --apply --delete-orphans.
 *
 * Dry run by default; nothing is written without --apply. Idempotent.
 *
 *   node scripts/migrate-legacy-tokens.js                     # report only
 *   node scripts/migrate-legacy-tokens.js --apply             # migrate
 *   node scripts/migrate-legacy-tokens.js --apply --max-age-days 30
 *   node scripts/migrate-legacy-tokens.js --apply --delete-orphans
 *
 * Requires REDIS_URL. Once it has run, set LEGACY_API_TOKENS_ACCEPTED_UNTIL
 * to make verify() refuse any record still without an expiry.
 */

/* eslint-disable no-console */

const {
  hashToken,
  isLegacyRecord,
  DEFAULT_MAX_AGE_SECONDS,
  HASH_HEX_RE,
  TOKEN_PREFIX,
  USER_TOKENS_PREFIX,
} = require('../shared/api-token-storage');

function parseRecord(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function migrateLegacyTokens(
  kv,
  {
    apply = false,
    deleteOrphans = false,
    nowMs = Date.now(),
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
    log = () => {},
  } = {}
) {
  const expiresAt = nowMs + maxAgeSeconds * 1000;
  const migratedAt = new Date(nowMs).toISOString();
  const summary = {
    scanned: 0,
    rekeyed: 0,
    expiryAdded: 0,
    skipped: 0,
    conflicts: 0,
    invalid: 0,
    orphans: 0,
  };

  async function isOrphan(key, id, rec) {
    if (await kv.sIsMember(USER_TOKENS_PREFIX + rec.email, id)) return false;
    summary.orphans++;
    log(`orphan    ${id.slice(0, 8)}… ${rec.email}`);
    if (apply && deleteOrphans) await kv.del(key);
    return true;
  }

  const keys = await kv.scanKeys(`${TOKEN_PREFIX}*`);
  for (const key of keys) {
    summary.scanned++;
    const id = key.slice(TOKEN_PREFIX.length);
    const rec = parseRecord(await kv.get(key));
    if (!rec || !rec.email) {
      summary.invalid++;
      log(`invalid   ${id.slice(0, 8)}…`);
      continue;
    }

    if (HASH_HEX_RE.test(id)) {
      if (rec.expiresAt != null) {
        summary.skipped++;
        continue;
      }
      if (await isOrphan(key, id, rec)) continue;
      summary.expiryAdded++;
      log(`expiry    ${id.slice(0, 8)}… ${rec.email}`);
      if (apply) {
        await kv.set(
          key,
          JSON.stringify({ ...rec, expiresAt, hashed: true, migratedAt })
        );
      }
      continue;
    }

    if (!isLegacyRecord(rec)) {
      summary.skipped++;
      continue;
    }
    if (await isOrphan(key, id, rec)) continue;

    const hash = hashToken(id);
    const hashedKey = TOKEN_PREFIX + hash;
    if (await kv.get(hashedKey)) {
      summary.conflicts++;
      log(`conflict  ${hash.slice(0, 8)}… ${rec.email}`);
      continue;
    }

    summary.rekeyed++;
    log(`rekey     ${hash.slice(0, 8)}… ${rec.email}`);
    if (!apply) continue;

    await kv.set(
      hashedKey,
      JSON.stringify({ ...rec, expiresAt, hashed: true, migratedAt })
    );
    await kv.sAdd(USER_TOKENS_PREFIX + rec.email, hash);
    await kv.sRem(USER_TOKENS_PREFIX + rec.email, id);
    await kv.del(key);
  }

  return summary;
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const deleteOrphans = argv.includes('--delete-orphans');
  const i = argv.indexOf('--max-age-days');
  let maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS;
  if (i !== -1) {
    const days = Number(argv[i + 1]);
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error('--max-age-days needs a positive number');
    }
    maxAgeSeconds = Math.round(days * 24 * 60 * 60);
  }
  return { apply, deleteOrphans, maxAgeSeconds };
}

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('Refusing to run: REDIS_URL is not set.');
    process.exit(1);
  }
  const { apply, deleteOrphans, maxAgeSeconds } = parseArgs(
    process.argv.slice(2)
  );
  const { kv } = require('../packages/backend/src/lib/kv-client');

  console.log(
    `Migrating legacy API tokens${apply ? '' : ' (dry run, pass --apply to write)'}...`
  );
  const summary = await migrateLegacyTokens(kv, {
    apply,
    deleteOrphans,
    maxAgeSeconds,
    log: line => console.log(line),
  });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.conflicts || summary.invalid ? 2 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrateLegacyTokens, parseArgs };
