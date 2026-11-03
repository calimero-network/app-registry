/**
 * Organization storage (Redis) for NPM-style organizations.
 * Members are identified by email address (not pubkey).
 * Keys: org:{org_id}, org:by_slug:{slug}, org:{org_id}:members, org:{org_id}:roles, pkg2org:{package}
 * Cloud: org:by_cloud:{cloud_org_id} -> org_id; the org document carries `cloud_org_id`.
 */

const { kv } = require('./kv-client');
const { invitations } = require('./org-invitations');

const ORG_PREFIX = 'org:';
const ORG_BY_SLUG_PREFIX = 'org:by_slug:';
const MEMBERS_SUFFIX = ':members';
const ROLES_SUFFIX = ':roles';
const PKG2ORG_PREFIX = 'pkg2org:';
const MEMBER2ORGS_PREFIX = 'member2orgs:';
const ORG_PACKAGES_SUFFIX = ':packages';
const ORG_BY_CLOUD_PREFIX = 'org:by_cloud:';

function _normEmail(email) {
  return (email && typeof email === 'string' ? email : '').toLowerCase();
}

/**
 * @param {string} orgId
 * @returns {Promise<{ id: string, name: string, slug: string, created_at?: string, updated_at?: string, metadata?: object } | null>}
 */
async function getOrg(orgId) {
  const id = typeof orgId === 'string' ? orgId : (orgId?.toString?.() ?? null);
  if (!id) return null;
  const key = ORG_PREFIX + id;
  const raw = await kv.get(key);
  if (raw === null || raw === undefined) return null;
  try {
    const str = typeof raw === 'string' ? raw : String(raw);
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * @param {object} org { id, name, slug, created_at?, updated_at?, metadata? }
 */
async function setOrg(org) {
  if (!org?.id || !org?.slug) {
    throw new Error('Org must have id and slug');
  }
  const key = ORG_PREFIX + org.id;
  const bySlugKey = ORG_BY_SLUG_PREFIX + org.slug;
  const now = new Date().toISOString();
  const data = {
    ...org,
    updated_at: org.updated_at || now,
    created_at: org.created_at || now,
  };
  await kv.set(key, JSON.stringify(data));
  await kv.set(bySlugKey, org.id);
}

/**
 * @param {string} slug
 * @returns {Promise<string | null>} org_id
 */
async function getOrgIdBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const raw = await kv.get(ORG_BY_SLUG_PREFIX + slug);
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

/**
 * @param {string} slug
 * @returns {Promise<object | null>} org document
 */
async function getOrgBySlug(slug) {
  const orgId = await getOrgIdBySlug(slug);
  return orgId ? getOrg(orgId) : null;
}

/**
 * @param {string} orgId
 * @returns {Promise<string[]>} list of member emails
 */
async function getOrgMembers(orgId) {
  if (!orgId) return [];
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  const members = await kv.sMembers(key);
  return Array.isArray(members) ? members : [];
}

/**
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function isOrgMember(orgId, email) {
  if (!orgId || !email) return false;
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  const norm = _normEmail(email);
  const a = await kv.sIsMember(key, norm);
  const b = await kv.sIsMember(key, email);
  return Boolean(a || b);
}

/** @type {ReadonlySet<string>} */
const VALID_ROLES = new Set(['owner', 'admin', 'member']);

/**
 * @param {string} orgId
 * @param {string} email
 * @param {string} [role] 'owner' | 'admin' | 'member'
 */
async function addOrgMember(orgId, email, role) {
  if (!orgId || !email) throw new Error('orgId and email required');
  const norm = _normEmail(email);
  const r = role && VALID_ROLES.has(role) ? role : 'member';
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sAdd(key, norm);
  await kv.sAdd(MEMBER2ORGS_PREFIX + norm, orgId);
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hSet(rolesKey, { [norm]: r });
}

/**
 * @param {string} orgId
 * @param {string} email
 */
async function removeOrgMember(orgId, email) {
  if (!orgId || !email) return;
  const norm = _normEmail(email);
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sRem(key, norm);
  await kv.sRem(key, email);
  await kv.sRem(MEMBER2ORGS_PREFIX + norm, orgId);
  await kv.sRem(MEMBER2ORGS_PREFIX + email, orgId);
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hDel(rolesKey, norm);
  await kv.hDel(rolesKey, email);
}

/**
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<string | null>} role or null
 */
async function getOrgMemberRole(orgId, email) {
  if (!orgId || !email) return null;
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  const norm = _normEmail(email);
  const role =
    (await kv.hGet(rolesKey, norm)) || (await kv.hGet(rolesKey, email));
  return role || null;
}

/**
 * Every member's role in one read.
 *
 * ⚠️ USE THIS WHEN LISTING. `getOrgMemberRole` costs TWO sequential `hGet`s
 * per member — it checks the normalised address and then the raw one, because
 * roles were written under both spellings historically — so the member list
 * was paying 2N round trips for a single hash. The whole hash is one reply.
 *
 * Returns a lookup that applies the same normalised-then-raw fallback, so it
 * answers identically to `getOrgMemberRole` for any address.
 *
 * @param {string} orgId
 * @returns {Promise<(email: string) => string|null>}
 */
async function getOrgMemberRoles(orgId) {
  if (!orgId) return () => null;
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  const all = (await kv.hGetAll(rolesKey)) || {};
  return email => {
    if (!email) return null;
    return all[_normEmail(email)] || all[email] || null;
  };
}

/**
 * Update a member's role without touching their membership.
 * @param {string} orgId
 * @param {string} email
 * @param {string} role 'owner' | 'admin' | 'member'
 */
async function updateOrgMemberRole(orgId, email, role) {
  if (!orgId || !email || !role)
    throw new Error('orgId, email and role required');
  if (!VALID_ROLES.has(role))
    throw new Error('role must be owner, admin, or member');
  const norm = _normEmail(email);
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hSet(rolesKey, { [norm]: role });
  if (norm !== email) await kv.hDel(rolesKey, email);
}

/**
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<boolean>} true if email is owner of org
 */
async function isOrgOwner(orgId, email) {
  const role = await getOrgMemberRole(orgId, email);
  return role === 'owner';
}

/**
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<boolean>} true if email is admin or owner of org
 */
async function isOrgAdmin(orgId, email) {
  const role = await getOrgMemberRole(orgId, email);
  return role === 'admin' || role === 'owner';
}

/**
 * @param {string} packageName
 * @returns {Promise<string | null>} org_id or null
 */
async function getPkg2Org(packageName) {
  if (!packageName || typeof packageName !== 'string') return null;
  return await kv.get(PKG2ORG_PREFIX + packageName);
}

/**
 * @param {string} packageName
 * @param {string} orgId
 */
async function setPkg2Org(packageName, orgId) {
  if (!packageName || !orgId) throw new Error('package and orgId required');
  const previousOrgId = await kv.get(PKG2ORG_PREFIX + packageName);
  await kv.set(PKG2ORG_PREFIX + packageName, orgId);
  await kv.sAdd(ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX, packageName);
  if (previousOrgId && previousOrgId !== orgId) {
    await kv.sRem(
      ORG_PREFIX + previousOrgId + ORG_PACKAGES_SUFFIX,
      packageName
    );
  }
}

/**
 * @param {string} packageName
 */
async function deletePkg2Org(packageName) {
  if (!packageName) return;
  const orgId = await kv.get(PKG2ORG_PREFIX + packageName);
  await kv.del(PKG2ORG_PREFIX + packageName);
  if (orgId) {
    await kv.sRem(ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX, packageName);
  }
}

/**
 * @param {string} orgId
 * @returns {Promise<string[]>} package names linked to this org
 */
async function getPackagesByOrg(orgId) {
  if (!orgId) return [];
  const key = ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX;
  const list = await kv.sMembers(key);
  return Array.isArray(list) ? list : [];
}

/**
 * Get org IDs that a member (email) belongs to.
 * @param {string} email
 * @returns {Promise<string[]>}
 */
async function getOrgIdsByMember(email) {
  if (!email) return [];
  const norm = _normEmail(email);
  const keyNorm = MEMBER2ORGS_PREFIX + norm;
  const keyRaw = MEMBER2ORGS_PREFIX + email;
  const [idsNorm, idsRaw] = await Promise.all([
    kv.sMembers(keyNorm),
    norm !== email ? kv.sMembers(keyRaw) : Promise.resolve([]),
  ]);
  const set = new Set([
    ...(Array.isArray(idsNorm) ? idsNorm : []),
    ...(Array.isArray(idsRaw) ? idsRaw : []),
  ]);
  return [...set];
}

/**
 * Get full org documents for a member (email).
 * @param {string} email
 * @returns {Promise<object[]>}
 */
async function getOrgsByMember(email) {
  const orgIds = await getOrgIdsByMember(email);
  // One wave, not one round trip per org. This backs "My organizations", so
  // the serial loop it replaces made the page slower for exactly the people
  // who belong to the most orgs.
  const orgs = await Promise.all(orgIds.map(id => getOrg(id)));
  return orgs.filter(Boolean);
}

/**
 * Delete an org and clean up all associated Redis keys.
 * Removes: org document, slug mapping, member sets/roles, package links, and reverse indexes.
 * @param {string} orgId
 */
async function deleteOrg(orgId) {
  if (!orgId) return;

  // Load org to get slug for by_slug cleanup
  const org = await getOrg(orgId);

  // Remove all member reverse indexes
  const members = await getOrgMembers(orgId);
  for (const email of members) {
    await kv.sRem(MEMBER2ORGS_PREFIX + email, orgId);
  }

  // Remove all package reverse indexes
  const packages = await getPackagesByOrg(orgId);
  for (const pkg of packages) {
    if ((await kv.get(PKG2ORG_PREFIX + pkg)) === orgId) {
      await kv.del(PKG2ORG_PREFIX + pkg);
    }
  }

  await invitations.removeAllForOrg(orgId);

  // Delete org data keys
  await kv.del(ORG_PREFIX + orgId + MEMBERS_SUFFIX);
  await kv.del(ORG_PREFIX + orgId + ROLES_SUFFIX);
  await kv.del(ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX);
  await kv.del(ORG_PREFIX + orgId);

  // Delete slug mapping
  if (org?.slug) {
    await kv.del(ORG_BY_SLUG_PREFIX + org.slug);
  }
  if (org?.cloud_org_id) {
    if ((await kv.get(ORG_BY_CLOUD_PREFIX + org.cloud_org_id)) === orgId) {
      await kv.del(ORG_BY_CLOUD_PREFIX + org.cloud_org_id);
    }
  }
}

// ── Calimero Cloud org linkage ──────────────────────────────────────────────
//
// A Cloud org (identified by the `org` claim of a Cloud JWT) maps to exactly
// one registry org, whose document carries `cloud_org_id`. Membership of a
// Cloud-linked org lives in Cloud — the registry trusts the role in the JWT —
// so these orgs normally have no registry members.

const CLOUD_ORG_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** @returns {Promise<string|null>} registry org id linked to a Cloud org */
async function getOrgIdByCloudOrg(cloudOrgId) {
  if (!cloudOrgId || typeof cloudOrgId !== 'string') return null;
  const raw = await kv.get(ORG_BY_CLOUD_PREFIX + cloudOrgId);
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

/** @returns {Promise<object|null>} registry org document linked to a Cloud org */
async function getOrgByCloudOrg(cloudOrgId) {
  const orgId = await getOrgIdByCloudOrg(cloudOrgId);
  return orgId ? getOrg(orgId) : null;
}

/**
 * Link an existing registry org to a Cloud org (migration / admin path).
 * Refuses to re-point a Cloud org that is already linked elsewhere.
 */
async function linkCloudOrg(orgId, cloudOrgId) {
  if (!CLOUD_ORG_ID_RE.test(String(cloudOrgId || ''))) {
    throw new Error('invalid cloud org id');
  }
  const org = await getOrg(orgId);
  if (!org) throw new Error(`org ${orgId} not found`);
  const existing = await getOrgIdByCloudOrg(cloudOrgId);
  if (existing && existing !== orgId) {
    throw new Error(`cloud org ${cloudOrgId} is already linked to ${existing}`);
  }
  if (org.cloud_org_id && org.cloud_org_id !== cloudOrgId) {
    throw new Error(`org ${orgId} is already linked to ${org.cloud_org_id}`);
  }
  await kv.set(ORG_BY_CLOUD_PREFIX + cloudOrgId, orgId);
  await setOrg({ ...org, cloud_org_id: cloudOrgId });
  return { ...org, cloud_org_id: cloudOrgId };
}

/** A slug for a new Cloud-backed org that collides with nothing. */
async function freeCloudSlug(orgSlug, cloudOrgId) {
  const {
    isReservedOrgSlug,
  } = require('@calimero-network/registry-shared/org-slugs');
  const base = String(orgSlug || '').toLowerCase();
  const tail = cloudOrgId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const candidates = [];
  // ⚠️ NEVER ADOPT AN EXISTING REGISTRY ORG BY SLUG. A Cloud org called
  // "acme" is not the registry org "acme" until an admin links them; it gets
  // a fresh, non-colliding slug instead.
  if (SLUG_RE.test(base) && !isReservedOrgSlug(base)) {
    candidates.push(base, `${base}-cloud`, `${base}-${tail || 'cloud'}`);
  }
  candidates.push(`cloud-${tail || 'org'}`);
  for (const slug of candidates) {
    if (!SLUG_RE.test(slug) || isReservedOrgSlug(slug)) continue;
    if (!(await getOrgIdBySlug(slug))) return slug;
  }
  return `cloud-${Date.now().toString(36)}`;
}

/**
 * The registry org for a Cloud org, created on first use. Idempotent and
 * race-safe: concurrent first publishes converge on one org through SETNX on
 * the `org:by_cloud:` index.
 *
 * @param {string} cloudOrgId - the JWT `org` claim
 * @param {string|null} orgSlug - the JWT `org_slug` claim (display only)
 * @returns {Promise<object>} org document
 */
async function ensureCloudOrg(cloudOrgId, orgSlug) {
  if (!CLOUD_ORG_ID_RE.test(String(cloudOrgId || ''))) {
    throw new Error('invalid cloud org id');
  }
  const linked = await getOrgByCloudOrg(cloudOrgId);
  if (linked) return linked;

  const orgId = `cloud-${cloudOrgId}`;
  const won = await kv.setNX(ORG_BY_CLOUD_PREFIX + cloudOrgId, orgId);
  if (!won) {
    const winner = await getOrgByCloudOrg(cloudOrgId);
    if (winner) return winner;
  }
  const existing = await getOrg(orgId);
  if (existing) return existing;
  const slug = await freeCloudSlug(orgSlug, cloudOrgId);
  const org = {
    id: orgId,
    name: orgSlug || slug,
    slug,
    cloud_org_id: cloudOrgId,
    metadata: { source: 'cloud' },
  };
  await setOrg(org);
  return (await getOrg(orgId)) || org;
}

const PUBLISHER_NOT_IN_PACKAGE_MESSAGE =
  "This bundle is signed with a package key, but the account publishing it is not the package owner, a member of its organization, or that organization's bot.";

async function publisherBelongsToPackage(latestManifest, packageName, email) {
  const {
    manifestOwnedByUser,
  } = require('@calimero-network/registry-shared/package-permissions');
  const {
    isStaffEmail,
  } = require('@calimero-network/registry-backend/src/lib/metadata-policy');
  const { isAdmin, isBot } = require('./admin-storage');
  const { getUserByEmail } = require('./user-storage');
  const orgId = await getPkg2Org(packageName);
  if (!latestManifest?.metadata?._ownerEmail && !orgId) return true;
  if (!email) return false;
  if (manifestOwnedByUser(latestManifest, { email })) return true;
  if (orgId && (await isOrgMember(orgId, email))) return true;
  if (orgId && (await isBot(email))) {
    const profile = await getUserByEmail(email);
    if (profile?.botOrg === orgId) return true;
  }
  return isStaffEmail(email) || !!(await isAdmin(email));
}

/**
 * Decide whether a new version of an existing package may be published.
 *
 * Two ways in:
 * 1. Key: the signing key is one of the package's owner keys
 *    (getOwnerKeys of the latest version), and the account belongs to the
 *    package (publisherBelongsToPackage). The new version's own signer /
 *    owners[] then define the key set going forward, as before.
 * 2. Organization: the package is linked to an org and the authenticated
 *    account is an admin or owner of it (plain members publish with a package
 *    key). The version is signed with the admin's own key, so the caller must
 *    stamp `ownerKeys` onto it as `_ownerKeys`: the package's existing key set
 *    is carried forward unchanged and the admin's key is not added to it. The
 *    admin keeps publishing only while they hold the role.
 *
 * @param {object} latestManifest - latest stored version of the package
 * @param {string} incomingKey - pubkey from the new bundle's signature
 * @param {string} packageName
 * @param {string} [authorEmail] - authenticated account (session/token)
 * @returns {Promise<{allowed: boolean, viaOrg: boolean, ownerKeys: string[] | null}>}
 */
async function resolvePublishPermission(
  latestManifest,
  incomingKey,
  packageName,
  authorEmail
) {
  const { isAllowedOwner, getOwnerKeys } = require('./verify');
  const denied = { allowed: false, viaOrg: false, ownerKeys: null };
  if (isAllowedOwner(latestManifest, incomingKey)) {
    if (
      await publisherBelongsToPackage(latestManifest, packageName, authorEmail)
    ) {
      return { allowed: true, viaOrg: false, ownerKeys: null };
    }
    return { ...denied, message: PUBLISHER_NOT_IN_PACKAGE_MESSAGE };
  }
  if (!authorEmail) return denied;
  const orgId = await getPkg2Org(packageName);
  if (!orgId) return denied;
  // Both the membership set and the role: a removed member has neither.
  if (!(await isOrgMember(orgId, authorEmail))) return denied;
  if (!(await isOrgAdmin(orgId, authorEmail))) return denied;
  return {
    allowed: true,
    viaOrg: true,
    ownerKeys: getOwnerKeys(latestManifest),
  };
}

/**
 * Boolean form of resolvePublishPermission.
 * @returns {Promise<boolean>}
 */
async function isAllowedToPublish(
  existingManifest,
  incomingKey,
  packageName,
  authorEmail
) {
  const { allowed } = await resolvePublishPermission(
    existingManifest,
    incomingKey,
    packageName,
    authorEmail
  );
  return allowed;
}

module.exports = {
  getOrg,
  setOrg,
  getOrgIdBySlug,
  getOrgBySlug,
  getOrgMembers,
  isOrgMember,
  addOrgMember,
  removeOrgMember,
  getOrgMemberRole,
  updateOrgMemberRole,
  isOrgOwner,
  isOrgAdmin,
  getOrgIdsByMember,
  getOrgsByMember,
  getOrgMemberRoles,
  getPkg2Org,
  setPkg2Org,
  deletePkg2Org,
  getPackagesByOrg,
  deleteOrg,
  getOrgIdByCloudOrg,
  getOrgByCloudOrg,
  linkCloudOrg,
  ensureCloudOrg,
  isAllowedToPublish,
  publisherBelongsToPackage,
  resolvePublishPermission,
};
