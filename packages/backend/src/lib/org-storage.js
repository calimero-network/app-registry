/**
 * Organization storage (Redis) for NPM-style organizations.
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
  if (!orgId || typeof orgId !== 'string') return null;
  const key = ORG_PREFIX + orgId;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
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
  return await kv.get(ORG_BY_SLUG_PREFIX + slug);
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
 * @returns {Promise<string[]>} list of pubkeys
 */
async function getOrgMembers(orgId) {
  if (!orgId) return [];
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  const members = await kv.sMembers(key);
  return Array.isArray(members) ? members : [];
}

/**
 * @param {string} orgId
 * @param {string} pubkey
 * @returns {Promise<boolean>}
 */
async function isOrgMember(orgId, pubkey) {
  if (!orgId || !pubkey) return false;
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  const result = await kv.sIsMember(key, pubkey);
  return Boolean(result);
}

/**
 * @param {string} orgId
 * @param {string} pubkey
 * @param {string} [role] e.g. 'admin' | 'member'
 */
async function addOrgMember(orgId, pubkey, role) {
  if (!orgId || !pubkey) throw new Error('orgId and pubkey required');
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sAdd(key, pubkey);
  await kv.sAdd(MEMBER2ORGS_PREFIX + pubkey, orgId);
  if (role) {
    const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
    await kv.hSet(rolesKey, { [pubkey]: role });
  }
}

/**
 * @param {string} orgId
 * @param {string} pubkey
 */
async function removeOrgMember(orgId, pubkey) {
  if (!orgId || !pubkey) return;
  const key = ORG_PREFIX + orgId + MEMBERS_SUFFIX;
  await kv.sRem(key, pubkey);
  await kv.sRem(MEMBER2ORGS_PREFIX + pubkey, orgId);
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hDel(rolesKey, pubkey);
}

/**
 * @param {string} orgId
 * @param {string} pubkey
 * @returns {Promise<string | null>} role or null
 */
async function getOrgMemberRole(orgId, pubkey) {
  if (!orgId || !pubkey) return null;
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  const role = await kv.hGet(rolesKey, pubkey);
  return role || null;
}

/**
 * Update a member's role without touching their membership.
 * @param {string} orgId
 * @param {string} pubkey
 * @param {string} role 'admin' | 'member'
 */
async function updateOrgMemberRole(orgId, pubkey, role) {
  if (!orgId || !pubkey || !role)
    throw new Error('orgId, pubkey and role required');
  const rolesKey = ORG_PREFIX + orgId + ROLES_SUFFIX;
  await kv.hSet(rolesKey, { [pubkey]: role });
}

/**
 * @param {string} orgId
 * @param {string} pubkey
 * @returns {Promise<boolean>} true if pubkey is admin of org
 */
async function isOrgAdmin(orgId, pubkey) {
  const role = await getOrgMemberRole(orgId, pubkey);
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
 * Get org IDs that a member (pubkey) belongs to.
 * @param {string} pubkey
 * @returns {Promise<string[]>}
 */
async function getOrgIdsByMember(pubkey) {
  if (!pubkey) return [];
  const key = MEMBER2ORGS_PREFIX + pubkey;
  const ids = await kv.sMembers(key);
  return Array.isArray(ids) ? ids : [];
}

/**
 * Get full org documents for a member (pubkey).
 * @param {string} pubkey
 * @returns {Promise<object[]>}
 */
async function getOrgsByMember(pubkey) {
  const orgIds = await getOrgIdsByMember(pubkey);
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
  for (const pk of members) {
    await kv.sRem(MEMBER2ORGS_PREFIX + pk, orgId);
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
 * Check if incomingKey can publish to package: either owner (existing rule) or org member when package is linked to org.
 * @param {object} existingManifest - current bundle manifest (for owner check)
 * @param {string} incomingKey - pubkey from request
 * @param {string} packageName - package name
 * @returns {Promise<boolean>}
 */
async function isAllowedToPublish(existingManifest, incomingKey, packageName) {
  const { isAllowedOwner } = require('./verify');
  if (isAllowedOwner(existingManifest, incomingKey)) return true;
  const orgId = await getPkg2Org(packageName);
  if (!orgId) return false;
  return isOrgMember(orgId, incomingKey);
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
