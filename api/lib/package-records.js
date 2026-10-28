/**
 * Per-package registry records: owning org, visibility, pinned signer —
 * plus namespace ownership and per-org publish quotas.
 *
 * Keys (Redis):
 *   pkg:<name>               JSON { name, org_id, visibility, signer_id,
 *                                   owner_email, created_at, updated_at,
 *                                   visibility_request? }
 *   ns:<namespace>           registry org id that owns the namespace
 *   visibility-requests      set of packages waiting on private -> public review
 *
 * ⚠️ NO RECORD MEANS PUBLIC. Every package published before this module
 * existed has no `pkg:` record (until scripts/migrate-package-records.js runs),
 * and it must keep behaving exactly as before. So the default is the public,
 * legacy behaviour and only an explicit `visibility: 'private'` hides anything.
 *
 * ⚠️ PRIVATE MEANS "DOES NOT EXIST" TO EVERYONE ELSE. Every read path answers
 * a private package the caller may not read exactly as it answers a package
 * that was never published (404 / absent from listings), so the name itself
 * does not leak.
 */

const crypto = require('crypto');
const canonicalize = require('canonicalize');
const { kv } = require('./kv-client');
const { appendAudit } = require('./org-audit');
const { notifyPublished } = require('./cloud-authorize');
const {
  getPkg2Org,
  setPkg2Org,
  isOrgMember,
  getOrg,
  ensureCloudOrg,
  getOrgIdByCloudOrg,
} = require('./org-storage');
const { isAdmin } = require('./admin-storage');
const {
  namespaceOf,
} = require('@calimero-network/registry-shared/package-namespace');

const PKG_PREFIX = 'pkg:';
const NS_PREFIX = 'ns:';
const VISIBILITY_REQUESTS = 'visibility-requests';
const VISIBILITIES = new Set(['public', 'private']);

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const DEFAULT_QUOTAS = Object.freeze({
  max_bundle_bytes: 100 * MiB,
  max_versions_per_package: 200,
  max_total_bytes: 5 * GiB,
});

// ── Records ────────────────────────────────────────────────────────────────

function parse(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function getPackageRecord(name) {
  if (!name || typeof name !== 'string') return null;
  return parse(await kv.get(PKG_PREFIX + name));
}

/** Records for many packages in one pipelined wave. */
async function getPackageRecords(names) {
  const raws = await Promise.all(names.map(n => kv.get(PKG_PREFIX + n)));
  const out = new Map();
  names.forEach((n, i) => out.set(n, parse(raws[i])));
  return out;
}

async function setPackageRecord(record) {
  if (!record?.name) throw new Error('package record needs a name');
  const now = new Date().toISOString();
  const data = {
    ...record,
    visibility: VISIBILITIES.has(record.visibility)
      ? record.visibility
      : 'public',
    created_at: record.created_at || now,
    updated_at: now,
  };
  await kv.set(PKG_PREFIX + record.name, JSON.stringify(data));
  return data;
}

async function deletePackageRecord(name) {
  await kv.del(PKG_PREFIX + name);
  await kv.sRem(VISIBILITY_REQUESTS, name);
}

function visibilityOf(record) {
  return record?.visibility === 'private' ? 'private' : 'public';
}

async function isPrivatePackage(pkg) {
  return visibilityOf(await getPackageRecord(pkg)) === 'private';
}

/** The registry org that owns `pkg`: its record, else the legacy pkg2org link. */
async function packageOrgId(pkg) {
  const record = await getPackageRecord(pkg);
  if (record?.org_id) return record.org_id;
  return (await getPkg2Org(pkg)) || null;
}

// ── Namespaces ─────────────────────────────────────────────────────────────

async function getNamespaceOwner(ns) {
  if (!ns) return null;
  const raw = await kv.get(NS_PREFIX + ns);
  return raw ? String(raw) : null;
}

/**
 * Packages already published in `ns` that `orgId` does not own. A namespace
 * can only be claimed when it is empty or every package in it already belongs
 * to the claimant — otherwise the first Cloud publish of `com.acme.x` would
 * take `com.acme` away from whoever published `com.acme.y` years ago.
 */
async function namespaceConflicts(ns, orgId, { except } = {}) {
  const all = (await kv.sMembers('bundles:all')) || [];
  const inNs = all.filter(p => p !== except && namespaceOf(p) === ns);
  if (inNs.length === 0) return [];
  const [records, links] = await Promise.all([
    getPackageRecords(inNs),
    Promise.all(inNs.map(p => getPkg2Org(p))),
  ]);
  return inNs.filter(
    (p, i) => (records.get(p)?.org_id || links[i] || null) !== orgId
  );
}

/**
 * Claim `ns` for `orgId` if unclaimed. Atomic (SETNX).
 * @returns {Promise<{ok: true} | {ok: false, owner?: string, conflicts?: string[]}>}
 */
async function claimNamespace(ns, orgId, { except } = {}) {
  const owner = await getNamespaceOwner(ns);
  if (owner) return owner === orgId ? { ok: true } : { ok: false, owner };
  const conflicts = await namespaceConflicts(ns, orgId, { except });
  if (conflicts.length) return { ok: false, conflicts };
  const won = await kv.setNX(NS_PREFIX + ns, orgId);
  if (won) return { ok: true };
  const winner = await getNamespaceOwner(ns);
  return winner === orgId ? { ok: true } : { ok: false, owner: winner };
}

// ── Read access ────────────────────────────────────────────────────────────

/**
 * May `user` read private package `record`?
 * Cloud users: `read` scope and a Cloud org linked to the package's org.
 * Registry users: site admin, a member of the package's org, or the account
 * that first published it.
 */
async function canReadPrivate(user, record) {
  if (!user || !record) return false;
  if (user.cloud) {
    if (!user.scopes?.includes('read')) return false;
    if (!record.org_id) return false;
    return (await getOrgIdByCloudOrg(user.cloudOrgId)) === record.org_id;
  }
  const email = String(user.email || '').toLowerCase();
  if (!email) return false;
  if (record.owner_email && record.owner_email.toLowerCase() === email) {
    return true;
  }
  if (record.org_id && (await isOrgMember(record.org_id, email))) return true;
  return !!(await isAdmin(email));
}

/**
 * Visibility gate for a single-package read.
 *
 * @param {object} req
 * @param {string} pkg
 * @param {(req: object) => Promise<object|null>} resolve - user resolver
 *   (resolveUser with allowCloud); only called when the package is private.
 * @returns {Promise<{allowed: boolean, private: boolean, record: object|null, user?: object|null}>}
 */
async function readGate(req, pkg, resolve) {
  const record = await getPackageRecord(pkg);
  if (visibilityOf(record) === 'public') {
    return { allowed: true, private: false, record };
  }
  const user = await resolve(req).catch(() => null);
  return {
    allowed: await canReadPrivate(user, record),
    private: true,
    record,
    user,
  };
}

/**
 * Split `names` into what the caller must not see and the private packages
 * they may see. One pipelined read for the records; access checks only for
 * the (rare) private ones, memoised per org/owner.
 *
 * @returns {Promise<{hidden: Set<string>, visiblePrivate: Set<string>}>}
 */
async function classifyPackages(names, user) {
  const unique = [...new Set(names)];
  const hidden = new Set();
  const visiblePrivate = new Set();
  if (unique.length === 0) return { hidden, visiblePrivate };
  const records = await getPackageRecords(unique);
  const verdicts = new Map();
  for (const name of unique) {
    const record = records.get(name);
    if (visibilityOf(record) !== 'private') continue;
    if (!user) {
      hidden.add(name);
      continue;
    }
    const key = `${record.org_id || ''}|${record.owner_email || ''}`;
    if (!verdicts.has(key)) {
      verdicts.set(key, await canReadPrivate(user, record));
    }
    (verdicts.get(key) ? visiblePrivate : hidden).add(name);
  }
  return { hidden, visiblePrivate };
}

/** Names among `names` the caller must not see. */
async function hiddenPackages(names, user) {
  return (await classifyPackages(names, user)).hidden;
}

/** Names of every private package (for surfaces that never show them). */
async function privatePackages(names) {
  const records = await getPackageRecords([...new Set(names)]);
  const out = new Set();
  for (const [name, record] of records) {
    if (visibilityOf(record) === 'private') out.add(name);
  }
  return out;
}

// ── Quotas ─────────────────────────────────────────────────────────────────

function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Effective quotas for an org: org.quotas overrides env, env overrides defaults. */
function quotasFor(org) {
  const base = {
    max_bundle_bytes: envNumber(
      'CLOUD_QUOTA_MAX_BUNDLE_BYTES',
      DEFAULT_QUOTAS.max_bundle_bytes
    ),
    max_versions_per_package: envNumber(
      'CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE',
      DEFAULT_QUOTAS.max_versions_per_package
    ),
    max_total_bytes: envNumber(
      'CLOUD_QUOTA_MAX_TOTAL_BYTES',
      DEFAULT_QUOTAS.max_total_bytes
    ),
  };
  const override =
    org?.quotas && typeof org.quotas === 'object' ? org.quotas : {};
  for (const key of Object.keys(base)) {
    const v = Number(override[key]);
    if (Number.isFinite(v) && v > 0) base[key] = v;
  }
  return base;
}

/**
 * Bytes stored by an org: the sum of `_installSize` over every version of
 * every package linked to it. Computed, not counted, so deletes can never
 * leave a counter drifting. Two pipelined waves.
 */
async function orgStoredBytes(orgId) {
  const pkgs = (await kv.sMembers(`org:${orgId}:packages`)) || [];
  if (!pkgs.length) return 0;
  const versionSets = await Promise.all(
    pkgs.map(p => kv.sMembers(`bundle-versions:${p}`))
  );
  const keys = [];
  pkgs.forEach((p, i) =>
    (versionSets[i] || []).forEach(v => keys.push(`bundle:${p}/${v}`))
  );
  const raws = await Promise.all(keys.map(k => kv.get(k)));
  let total = 0;
  for (const raw of raws) {
    const size = Number(parse(raw)?.json?._installSize);
    if (Number.isFinite(size) && size > 0) total += size;
  }
  return total;
}

/** A quota refusal for this publish, or null. */
async function quotaRefusal(org, { versionsCount, installSize }) {
  const q = quotasFor(org);
  const refuse = (message, limit) => ({
    status: 413,
    body: { error: 'quota_exceeded', message, limit },
  });
  if (installSize > q.max_bundle_bytes) {
    return refuse(
      `Bundle is ${installSize} bytes; this org's limit is ${q.max_bundle_bytes} bytes per bundle.`,
      { max_bundle_bytes: q.max_bundle_bytes }
    );
  }
  if (versionsCount + 1 > q.max_versions_per_package) {
    return refuse(
      `This package already has ${versionsCount} versions; this org's limit is ${q.max_versions_per_package}. Delete old versions first.`,
      { max_versions_per_package: q.max_versions_per_package }
    );
  }
  const used = await orgStoredBytes(org.id);
  if (used + installSize > q.max_total_bytes) {
    return refuse(
      `This org stores ${used} bytes; publishing ${installSize} more would exceed its ${q.max_total_bytes}-byte limit.`,
      { max_total_bytes: q.max_total_bytes, used_bytes: used }
    );
  }
  return null;
}

// ── Publish gate ───────────────────────────────────────────────────────────

/** Requested visibility from `_visibility` (body) or `X-Registry-Visibility`. */
function requestedVisibility(manifest, headers) {
  const raw =
    manifest?._visibility ?? headers?.['x-registry-visibility'] ?? undefined;
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const value = String(raw).toLowerCase();
  if (!VISIBILITIES.has(value)) {
    return {
      refusal: {
        status: 400,
        body: {
          error: 'invalid_visibility',
          message: 'visibility must be "public" or "private"',
        },
      },
    };
  }
  return { value };
}

const refusal = (status, error, message, extra = {}) => ({
  refusal: { status, body: { error, message, ...extra } },
});

/**
 * Decide the org / namespace / visibility / quota side of a publish. Called by
 * both publish routes after signature verification and the retired check.
 *
 * Cloud users (`user.cloud`): need the `publish` scope; publish into their
 * Cloud org's registry org (created on first use); new packages must be in an
 * unclaimed namespace (claimed here) or one their org owns; existing packages
 * must belong to their org AND be signed by a pinned key (no org-admin key
 * override); quotas apply; visibility defaults to private.
 *
 * Registry users: unchanged ownership rules (the caller's
 * resolvePublishPermission), plus: a NEW package in a namespace owned by an
 * org needs membership of that org (or site admin) and is linked to it.
 * Visibility defaults to public.
 *
 * @returns {Promise<{refusal: {status: number, body: object}} | {plan: object}>}
 */
async function publishGate({
  user,
  pkg,
  versions,
  latestManifest,
  incomingKey,
  installSize,
  manifest,
  headers,
}) {
  const { isAllowedOwner } = require('./verify');
  const req = requestedVisibility(manifest, headers);
  if (req.refusal) return req;
  const isNew = versions.length === 0;
  const record = await getPackageRecord(pkg);
  const warnings = [];
  const plan = {
    pkg,
    isNew,
    record,
    orgId: null,
    org: null,
    linkOrg: false,
    visibility: 'public',
    warnings,
  };

  const currentVisibility = visibilityOf(record);
  const settleVisibility = fallback => {
    if (isNew) {
      plan.visibility = req.value || fallback;
      return;
    }
    plan.visibility = currentVisibility;
    if (req.value && req.value !== currentVisibility) {
      warnings.push(
        `Visibility stays "${currentVisibility}": a publish does not change an existing package's visibility; use PUT /api/v2/packages/${pkg}/visibility.`
      );
    }
  };

  if (user?.cloud) {
    if (!user.scopes.includes('publish')) {
      return refusal(
        403,
        'insufficient_scope',
        'This Cloud token lacks the "publish" scope.'
      );
    }
    const org = await ensureCloudOrg(user.cloudOrgId, user.orgSlug);
    plan.org = org;
    plan.orgId = org.id;

    if (isNew) {
      const {
        reservedPackagePrefix,
      } = require('@calimero-network/registry-backend/src/lib/metadata-policy');
      const reserved = reservedPackagePrefix(pkg);
      if (reserved) {
        return refusal(
          403,
          'reserved_prefix',
          `The "${reserved}" package namespace is reserved for Calimero.`
        );
      }
    } else {
      const owningOrg = record?.org_id || (await getPkg2Org(pkg)) || null;
      if (owningOrg !== org.id) {
        return refusal(
          403,
          'not_owner',
          'This package belongs to a different organization.'
        );
      }
      if (!isAllowedOwner(latestManifest, incomingKey)) {
        return refusal(
          403,
          'signer_mismatch',
          "This version is not signed with the package's pinned signing key (or a key in its owners[])."
        );
      }
    }

    const quota = await quotaRefusal(org, {
      versionsCount: versions.length,
      installSize,
    });
    if (quota) return { refusal: quota };

    if (isNew) {
      // Last, so a publish refused for any other reason claims nothing.
      const ns = namespaceOf(pkg);
      const claim = await claimNamespace(ns, org.id, { except: pkg });
      if (!claim.ok) {
        return claim.conflicts
          ? refusal(
              409,
              'namespace_conflict',
              `The "${ns}" namespace already holds packages owned by someone else, so it cannot be claimed. Ask a registry admin to resolve it.`,
              { namespace: ns }
            )
          : refusal(
              403,
              'namespace_owned',
              `The "${ns}" namespace belongs to another organization.`,
              { namespace: ns }
            );
      }
      plan.linkOrg = true;
    }
    settleVisibility('private');
    return { plan };
  }

  // Registry (legacy) publisher.
  if (isNew) {
    const ns = namespaceOf(pkg);
    const owner = await getNamespaceOwner(ns);
    if (owner) {
      const email = user?.email;
      const allowed =
        !!email &&
        ((await isOrgMember(owner, email)) || !!(await isAdmin(email)));
      if (!allowed) {
        return refusal(
          403,
          'namespace_owned',
          `The "${ns}" namespace belongs to an organization you are not a member of.`,
          { namespace: ns }
        );
      }
      plan.orgId = owner;
      plan.linkOrg = true;
    }
  } else {
    plan.orgId = record?.org_id || null;
  }
  settleVisibility('public');
  return { plan };
}

/**
 * After the bundle is stored: link the org, write/refresh the package record.
 * Returns the record.
 */
async function commitPublish(plan, { user, incomingKey, ownerEmail }) {
  if (plan.linkOrg && plan.orgId) await setPkg2Org(plan.pkg, plan.orgId);
  if (plan.record) return plan.record;
  // A new package, or a pre-migration package seen for the first time: write
  // its record. A pre-migration package keeps the legacy default (public) and
  // its existing org link.
  const orgId = plan.orgId || (await getPkg2Org(plan.pkg)) || null;
  return setPackageRecord({
    name: plan.pkg,
    org_id: orgId,
    visibility: plan.isNew ? plan.visibility : 'public',
    signer_id: incomingKey || null,
    owner_email: (ownerEmail || user?.email || '').toLowerCase() || null,
  });
}

/**
 * Must equal MANIFEST_SIGNING_DOMAIN in api/lib/verify.js (and core's
 * calimero-bundle crate); pinned by a test.
 */
const MANIFEST_SIGNING_DOMAIN = Buffer.from('calimero.bundle.manifest.v1\0');

/**
 * `sha256:<hex>` of exactly what the publisher signed: the domain tag and the
 * RFC 8785 form of the manifest without `signature` and `_`-prefixed keys.
 * Call it BEFORE the publish route rewrites server-owned metadata.
 */
function manifestDigest(manifest) {
  const signed = Object.fromEntries(
    Object.entries(manifest || {}).filter(
      ([key]) => key !== 'signature' && !key.startsWith('_')
    )
  );
  return `sha256:${crypto
    .createHash('sha256')
    .update(MANIFEST_SIGNING_DOMAIN)
    .update(canonicalize(signed))
    .digest('hex')}`;
}

/** `sha256:<hex>` of the .mpk bytes (Buffer or hex string). */
function bundleDigest(bytes) {
  if (!bytes) return null;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'hex');
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

/**
 * Everything after a bundle is stored, shared by both publish routes: write
 * the package record and org link, append the audit event, and — for a
 * package owned by a Cloud-linked org — notify the Cloud manager.
 *
 * @returns {Promise<object>} the package record
 */
async function finishPublish(
  plan,
  { user, incomingKey, ownerEmail, version, installSize, digests = {} }
) {
  const record = await commitPublish(plan, { user, incomingKey, ownerEmail });
  const orgId = record?.org_id || plan.orgId || null;
  const visibility = record?.visibility || plan.visibility;
  const via = user?.cloud ? 'cloud' : 'registry';
  await appendAudit(orgId, {
    type: 'publish',
    package: plan.pkg,
    version,
    user,
    via,
    details: {
      visibility,
      install_size: installSize ?? null,
      signer: incomingKey || null,
      ...(digests.manifest ? { manifest_digest: digests.manifest } : {}),
    },
  });
  const org = plan.org || (orgId ? await getOrg(orgId) : null);
  if (org?.cloud_org_id) {
    await notifyPublished({
      package: plan.pkg,
      version,
      org: org.cloud_org_id,
      visibility,
      manifest_digest: digests.manifest || null,
      bundle_digest: digests.bundle || null,
      signer: incomingKey || null,
      published_at: new Date().toISOString(),
      via: user?.cloud ? user.via || 'cloud' : 'registry',
      ...(user?.cloud && user.keyId ? { key_id: user.keyId } : {}),
    });
  }
  return record;
}

// ── Visibility changes ─────────────────────────────────────────────────────

/** Record (or refresh) the record of an existing package lacking one. */
async function ensureRecord(pkg, { latestManifest } = {}) {
  const existing = await getPackageRecord(pkg);
  if (existing) return existing;
  const { getPublicKeyFromManifest } = require('./verify');
  let signer = null;
  try {
    signer = latestManifest ? getPublicKeyFromManifest(latestManifest) : null;
  } catch {
    signer = null;
  }
  return setPackageRecord({
    name: pkg,
    org_id: (await getPkg2Org(pkg)) || null,
    visibility: 'public',
    signer_id: signer,
    owner_email:
      String(latestManifest?.metadata?._ownerEmail || '').toLowerCase() || null,
  });
}

/**
 * Apply a visibility change requested by a package manager.
 * public -> private: immediate.
 * private -> public: queued for admin review (the existing review queue),
 *   unless `immediate` (site admin).
 * private -> private: cancels a pending public request.
 *
 * @returns {Promise<{record: object, changed: boolean, pending: boolean, from: string, to: string}>}
 */
async function changeVisibility(
  pkg,
  to,
  { by, immediate = false, latestManifest }
) {
  if (!VISIBILITIES.has(to)) throw new Error('invalid visibility');
  const record = await ensureRecord(pkg, { latestManifest });
  const from = visibilityOf(record);
  const next = { ...record };

  if (to === 'private') {
    const hadRequest = !!record.visibility_request;
    delete next.visibility_request;
    next.visibility = 'private';
    await kv.sRem(VISIBILITY_REQUESTS, pkg);
    const saved = await setPackageRecord(next);
    return {
      record: saved,
      changed: from !== 'private' || hadRequest,
      pending: false,
      from,
      to,
    };
  }

  if (from === 'public') {
    return { record, changed: false, pending: false, from, to };
  }
  if (immediate) {
    delete next.visibility_request;
    next.visibility = 'public';
    await kv.sRem(VISIBILITY_REQUESTS, pkg);
    return {
      record: await setPackageRecord(next),
      changed: true,
      pending: false,
      from,
      to,
    };
  }
  next.visibility_request = {
    to: 'public',
    requested_by: by || null,
    requested_at: new Date().toISOString(),
  };
  await kv.sAdd(VISIBILITY_REQUESTS, pkg);
  return {
    record: await setPackageRecord(next),
    changed: true,
    pending: true,
    from,
    to,
  };
}

/**
 * Resolve a pending private -> public request (admin review).
 * @returns {Promise<object|null>} updated record, or null when nothing was pending
 */
async function decideVisibilityRequest(pkg, { approve, by, reason = '' }) {
  const record = await getPackageRecord(pkg);
  if (!record?.visibility_request) return null;
  const next = { ...record };
  delete next.visibility_request;
  if (approve) next.visibility = 'public';
  next.visibility_decision = {
    to: 'public',
    approved: !!approve,
    by: by || null,
    at: new Date().toISOString(),
    reason: String(reason || '').slice(0, 500),
  };
  await kv.sRem(VISIBILITY_REQUESTS, pkg);
  return setPackageRecord(next);
}

async function pendingVisibilityRequests() {
  const members = await kv.sMembers(VISIBILITY_REQUESTS);
  return Array.isArray(members) ? members : [];
}

/** Shape of a record that may be shown to the package's managers. */
function publicRecord(record) {
  if (!record) return { visibility: 'public' };
  return {
    visibility: visibilityOf(record),
    org_id: record.org_id || null,
    created_at: record.created_at || null,
    ...(record.visibility_request
      ? { pending_visibility: record.visibility_request.to }
      : {}),
  };
}

module.exports = {
  PKG_PREFIX,
  NS_PREFIX,
  VISIBILITY_REQUESTS,
  DEFAULT_QUOTAS,
  getPackageRecord,
  getPackageRecords,
  setPackageRecord,
  deletePackageRecord,
  visibilityOf,
  isPrivatePackage,
  packageOrgId,
  namespaceOf,
  getNamespaceOwner,
  claimNamespace,
  namespaceConflicts,
  canReadPrivate,
  readGate,
  classifyPackages,
  hiddenPackages,
  privatePackages,
  quotasFor,
  orgStoredBytes,
  quotaRefusal,
  requestedVisibility,
  publishGate,
  commitPublish,
  finishPublish,
  manifestDigest,
  bundleDigest,
  MANIFEST_SIGNING_DOMAIN,
  ensureRecord,
  changeVisibility,
  decideVisibilityRequest,
  pendingVisibilityRequests,
  publicRecord,
};
