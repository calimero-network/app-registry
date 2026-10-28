/**
 * One-off migration for Cloud private packages: give every existing package a
 * `pkg:<name>` record, optionally link registry orgs to Cloud orgs, and
 * optionally claim namespaces for orgs that already hold all of one.
 *
 * Every existing package becomes `visibility: public` (what it already is)
 * with `org_id` from its current `pkg2org:` link, `signer_id` from its latest
 * version's signature and `owner_email` from `_ownerEmail`. Existing records
 * are never touched, so the script is idempotent and safe to re-run after
 * Cloud publishes have started.
 *
 * Dry run by default; nothing is written without --apply.
 *
 *   node scripts/migrate-package-records.js
 *   node scripts/migrate-package-records.js --apply
 *   node scripts/migrate-package-records.js --apply --link-cloud-org acme=org_123
 *   node scripts/migrate-package-records.js --apply --claim-namespaces
 *
 * --link-cloud-org <registryOrgId>=<cloudOrgId>  (repeatable) sets the org
 *   document's `cloud_org_id` and the `org:by_cloud:` index, so the Cloud org's
 *   tokens act on that registry org's packages. Refuses to re-point a link.
 * --claim-namespaces  claims `ns:<namespace>` for an org when every package
 *   in that namespace already belongs to it (and the namespace is not
 *   reserved). Unowned or mixed namespaces are reported, never claimed.
 *
 * Requires REDIS_URL.
 */

/* eslint-disable no-console */

const semver = require('semver');
const { namespaceOf } = require('../shared/package-namespace');
const {
  reservedPackagePrefix,
} = require('../packages/backend/src/lib/metadata-policy');

function parse(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function sortDesc(versions) {
  return [...versions].sort((a, b) =>
    semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
  );
}

function signerOf(manifest) {
  const sig = manifest?.signature;
  return sig?.publicKey || sig?.pubkey || null;
}

async function linkCloudOrg(kv, orgId, cloudOrgId, { apply, log, summary }) {
  const org = parse(await kv.get(`org:${orgId}`));
  if (!org) {
    summary.errors++;
    log(`link      ${orgId}: no such registry org`);
    return;
  }
  const existing = await kv.get(`org:by_cloud:${cloudOrgId}`);
  if (existing && existing !== orgId) {
    summary.errors++;
    log(`link      ${cloudOrgId} already linked to ${existing}`);
    return;
  }
  if (org.cloud_org_id && org.cloud_org_id !== cloudOrgId) {
    summary.errors++;
    log(`link      ${orgId} already linked to ${org.cloud_org_id}`);
    return;
  }
  summary.linked++;
  log(`link      ${orgId} <- cloud ${cloudOrgId}`);
  if (!apply) return;
  await kv.set(`org:by_cloud:${cloudOrgId}`, orgId);
  await kv.set(
    `org:${orgId}`,
    JSON.stringify({
      ...org,
      cloud_org_id: cloudOrgId,
      updated_at: new Date().toISOString(),
    })
  );
}

async function migratePackageRecords(
  kv,
  {
    apply = false,
    links = [],
    claimNamespaces = false,
    now = () => new Date().toISOString(),
    log = () => {},
  } = {}
) {
  const summary = {
    scanned: 0,
    created: 0,
    existing: 0,
    linked: 0,
    claimed: 0,
    unclaimable: 0,
    errors: 0,
  };

  for (const [orgId, cloudOrgId] of links) {
    await linkCloudOrg(kv, orgId, cloudOrgId, { apply, log, summary });
  }

  const packages = (await kv.sMembers('bundles:all')) || [];
  const ownerByPkg = new Map();
  for (const pkg of packages) {
    summary.scanned++;
    const existing = parse(await kv.get(`pkg:${pkg}`));
    const link = (await kv.get(`pkg2org:${pkg}`)) || null;
    if (existing) {
      summary.existing++;
      ownerByPkg.set(pkg, existing.org_id || link || null);
      continue;
    }
    const versions = sortDesc(
      (await kv.sMembers(`bundle-versions:${pkg}`)) || []
    );
    const latest = versions.length
      ? parse(await kv.get(`bundle:${pkg}/${versions[0]}`))
      : null;
    const oldest = versions.length
      ? parse(await kv.get(`bundle:${pkg}/${versions[versions.length - 1]}`))
      : null;
    const record = {
      name: pkg,
      org_id: link,
      visibility: 'public',
      signer_id: signerOf(latest?.json),
      owner_email:
        String(
          oldest?.json?.metadata?._ownerEmail ||
            latest?.json?.metadata?._ownerEmail ||
            ''
        ).toLowerCase() || null,
      created_at: oldest?.json?._publishedAt || oldest?.created_at || now(),
      updated_at: now(),
      migrated_at: now(),
    };
    ownerByPkg.set(pkg, link);
    summary.created++;
    log(`record    ${pkg} org=${link || '-'} public`);
    if (apply) await kv.set(`pkg:${pkg}`, JSON.stringify(record));
  }

  if (claimNamespaces) {
    const byNs = new Map();
    for (const pkg of packages) {
      const ns = namespaceOf(pkg);
      if (!byNs.has(ns)) byNs.set(ns, new Set());
      byNs.get(ns).add(ownerByPkg.get(pkg) || null);
    }
    for (const [ns, owners] of byNs) {
      const [only] = [...owners];
      if (owners.size !== 1 || !only) {
        summary.unclaimable++;
        log(
          `ns        ${ns}: not claimable (owners: ${[...owners].map(o => o || '-').join(',')})`
        );
        continue;
      }
      if (reservedPackagePrefix(`${ns}.x`)) {
        summary.unclaimable++;
        log(`ns        ${ns}: reserved`);
        continue;
      }
      const current = await kv.get(`ns:${ns}`);
      if (current) continue;
      summary.claimed++;
      log(`ns        ${ns} -> ${only}`);
      if (apply) await kv.setNX(`ns:${ns}`, only);
    }
  }

  return summary;
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const claimNamespaces = argv.includes('--claim-namespaces');
  const links = [];
  argv.forEach((arg, i) => {
    if (arg !== '--link-cloud-org') return;
    const value = argv[i + 1] || '';
    const m = /^([^=\s]+)=([A-Za-z0-9_-]{1,128})$/.exec(value);
    if (!m) {
      throw new Error('--link-cloud-org needs <registryOrgId>=<cloudOrgId>');
    }
    links.push([m[1], m[2]]);
  });
  return { apply, claimNamespaces, links };
}

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('Refusing to run: REDIS_URL is not set.');
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  const { kv } = require('../packages/backend/src/lib/kv-client');
  console.log(
    `Migrating package records${opts.apply ? '' : ' (dry run, pass --apply to write)'}...`
  );
  const summary = await migratePackageRecords(kv, {
    ...opts,
    log: line => console.log(line),
  });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors ? 2 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migratePackageRecords, parseArgs };
