/**
 * Validation for organization writes (create + PATCH), shared by the Vercel
 * serverless API and the Fastify backend.
 *
 * Only WRITES are validated. Orgs stored before these limits existed may carry
 * other metadata keys or longer values; they stay readable as they are.
 */

const { findUnsafeMetadataUrl } = require('./metadata-urls');
const { normalizeOrgName } = require('./org-slugs');

const ORG_NAME_MAX_LENGTH = 100;

/** Max orgs one account may own (site admins are exempt). */
const MAX_OWNED_ORGS_PER_ACCOUNT = 20;

/**
 * The metadata keys the org settings form writes (see OrgDetailPage), each
 * with its maximum length. Anything else is refused.
 */
const ORG_METADATA_FIELDS = Object.freeze({
  description: 500,
  website: 200,
  email: 254,
  github: 200,
  twitter: 200,
  location: 100,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} name
 * @returns {string | null} error message, or null when valid
 */
function validateOrgName(name) {
  if (typeof name !== 'string' || normalizeOrgName(name) === '') {
    return 'name must be a non-empty string';
  }
  if (normalizeOrgName(name).length > ORG_NAME_MAX_LENGTH) {
    return `name must be at most ${ORG_NAME_MAX_LENGTH} characters`;
  }
  return null;
}

/**
 * Validate and normalise an org metadata object for storage.
 * `null` clears the metadata. Values are trimmed; empty/null values are
 * dropped (they mean "cleared").
 *
 * @param {unknown} metadata
 * @returns {{ error: string } | { value: Record<string, string> }}
 */
function validateOrgMetadata(metadata) {
  if (metadata === null) return { value: {} };
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { error: 'metadata must be an object' };
  }
  const value = {};
  for (const [key, raw] of Object.entries(metadata)) {
    if (!Object.prototype.hasOwnProperty.call(ORG_METADATA_FIELDS, key)) {
      return {
        error: `metadata.${key} is not a supported field (allowed: ${Object.keys(
          ORG_METADATA_FIELDS
        ).join(', ')})`,
      };
    }
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string') {
      return { error: `metadata.${key} must be a string` };
    }
    const v = raw.trim();
    if (v === '') continue;
    const max = ORG_METADATA_FIELDS[key];
    if (v.length > max) {
      return { error: `metadata.${key} must be at most ${max} characters` };
    }
    if (key === 'email' && !EMAIL_REGEX.test(v)) {
      return { error: 'metadata.email must be a valid email address' };
    }
    value[key] = v;
  }
  const badUrl = findUnsafeMetadataUrl(value);
  if (badUrl) return { error: `metadata.${badUrl} must be an http(s) URL` };
  return { value };
}

/**
 * Number of orgs `email` owns, given the org-storage helpers.
 * @param {{ getOrgIdsByMember: Function, getOrgMemberRole: Function }} storage
 * @param {string} email
 */
async function countOwnedOrgs(storage, email) {
  const ids = await storage.getOrgIdsByMember(email);
  const roles = await Promise.all(
    ids.map(id => storage.getOrgMemberRole(id, email))
  );
  return roles.filter(r => r === 'owner').length;
}

module.exports = {
  ORG_NAME_MAX_LENGTH,
  MAX_OWNED_ORGS_PER_ACCOUNT,
  ORG_METADATA_FIELDS,
  validateOrgName,
  validateOrgMetadata,
  countOwnedOrgs,
};
