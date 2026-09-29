/**
 * SECURITY: org/package metadata carries fields the frontend renders as raw
 * <a href> links (website, github, twitter — see OrgDetailPage). Without a
 * scheme check a stored `javascript:` or `data:` URL becomes a stored-XSS /
 * click-hijack vector the moment another member opens the org page. Validate
 * these fields server-side so a bad scheme can never be persisted.
 *
 * Shared by the Vercel serverless API and the Fastify backend.
 */

// Metadata keys the frontend turns into clickable hrefs. `email` is rendered as
// a mailto: (not a raw URL) and text-only fields (description, location) are
// never linked, so neither is checked here.
const URL_METADATA_FIELDS = ['website', 'github', 'twitter'];

/**
 * True when `value` is safe to render as a link: an absolute http(s) URL, or
 * empty/undefined (the field is optional). Anything else — javascript:, data:,
 * file:, a bare string, etc. — is rejected.
 */
function isSafeHttpUrl(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return true; // optional / cleared field
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * Returns the name of the first URL-bearing metadata field with an unsafe
 * value, or null when every such field is safe (or absent).
 */
function findUnsafeMetadataUrl(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  for (const field of URL_METADATA_FIELDS) {
    if (field in metadata && !isSafeHttpUrl(metadata[field])) return field;
  }
  return null;
}

module.exports = { URL_METADATA_FIELDS, isSafeHttpUrl, findUnsafeMetadataUrl };
