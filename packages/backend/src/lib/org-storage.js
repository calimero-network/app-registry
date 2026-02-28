/**
 * Organization storage (Redis) for NPM-style organizations.
 * Members are identified by email address (not pubkey).
 * Keys: org:{org_id}, org:by_slug:{slug}, org:{org_id}:members, org:{org_id}:roles, pkg2org:{package}
 */

const { kv } = require('./kv-client');

const ORG_PREFIX = 'org:';
const ORG_BY_SLUG_PREFIX = 'org:by_slug:';
const MEMBERS_SUFFIX = ':members';
const ROLES_SUFFIX = ':roles';
const PKG2ORG_PREFIX = 'pkg2org:';
const MEMBER2ORGS_PREFIX = 'member2orgs:';
const ORG_PACKAGES_SUFFIX = ':packages';

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
  const result = await kv.sIsMember(key, email);
  return Boolean(result);
}

/**
 * @param {string} orgId
 * @param {string} email
 * @param {string} [role] e.g. 'admin' | 'member'
 */
async function addOrgMember(orgId, email, role) {
  if (!orgId || !email) throw new Error('orgId and email required');
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sAdd(key, email);
  await kv.sAdd(MEMBER2ORGS_PREFIX + email, orgId);
  if (role) {
    const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
    await kv.hSet(rolesKey, { [email]: role });
  }
}

/**
 * @param {string} orgId
 * @param {string} email
 */
async function removeOrgMember(orgId, email) {
  if (!orgId || !email) return;
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sRem(key, email);
  await kv.sRem(MEMBER2ORGS_PREFIX + email, orgId);
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
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
  const role = await kv.hGet(rolesKey, email);
  return role || null;
}

/**
 * Update a member's role without touching their membership.
 * @param {string} orgId
 * @param {string} email
 * @param {string} role 'admin' | 'member'
 */
async function updateOrgMemberRole(orgId, email, role) {
  if (!orgId || !email || !role)
    throw new Error('orgId, email and role required');
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hSet(rolesKey, { [email]: role });
}

/**
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<boolean>} true if email is admin of org
 */
async function isOrgAdmin(orgId, email) {
  const role = await getOrgMemberRole(orgId, email);
  return role === 'admin';
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
  await kv.set(PKG2ORG_PREFIX + packageName, orgId);
  await kv.sAdd(ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX, packageName);
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
  const key = MEMBER2ORGS_PREFIX + email;
  const ids = await kv.sMembers(key);
  return Array.isArray(ids) ? ids : [];
}

/**
 * Get full org documents for a member (email).
 * @param {string} email
 * @returns {Promise<object[]>}
 */
async function getOrgsByMember(email) {
  const orgIds = await getOrgIdsByMember(email);
  const orgs = [];
  for (const id of orgIds) {
    const org = await getOrg(id);
    if (org) orgs.push(org);
  }
  return orgs;
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
    await kv.del(PKG2ORG_PREFIX + pkg);
  }

  // Delete org data keys
  await kv.del(ORG_PREFIX + orgId + MEMBERS_SUFFIX);
  await kv.del(ORG_PREFIX + orgId + ROLES_SUFFIX);
  await kv.del(ORG_PREFIX + orgId + ORG_PACKAGES_SUFFIX);
  await kv.del(ORG_PREFIX + orgId);

  // Delete slug mapping
  if (org?.slug) {
    await kv.del(ORG_BY_SLUG_PREFIX + org.slug);
  }
}

/**
 * Check if authorEmail can publish to package: either owner (pubkey match) or org member by email.
 * @param {object} existingManifest - current bundle manifest (for owner pubkey check)
 * @param {string} incomingKey - pubkey from bundle signature
 * @param {string} packageName - package name
 * @param {string} [authorEmail] - email of author (from session/token), used for org membership check
 * @returns {Promise<boolean>}
 */
async function isAllowedToPublish(
  existingManifest,
  incomingKey,
  packageName,
  authorEmail
) {
  const { isAllowedOwner } = require('./verify');
  if (isAllowedOwner(existingManifest, incomingKey)) return true;
  const orgId = await getPkg2Org(packageName);
  if (!orgId) return false;
  if (authorEmail) return isOrgMember(orgId, authorEmail);
  return false;
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
  isOrgAdmin,
  getOrgIdsByMember,
  getOrgsByMember,
  getPkg2Org,
  setPkg2Org,
  deletePkg2Org,
  getPackagesByOrg,
  deleteOrg,
  isAllowedToPublish,
};
