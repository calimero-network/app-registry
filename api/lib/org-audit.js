/**
 * Append-only audit log per registry org.
 *
 * Key: `org-audit:<org_id>` — a Redis list, oldest first, one JSON event per
 * entry. Nothing in the codebase trims, rewrites or deletes it (deleting an
 * org leaves its log in place), so it is a record of what happened, not of
 * what currently is.
 *
 * Event: { id, at, type, org_id, package, version?, actor: { id, via }, details? }
 *   type: publish | visibility_change | visibility_request |
 *         visibility_decision | yank | unyank | delete_version | delete_package
 *   actor.via: cloud | session | token | admin
 *
 * ⚠️ BEST EFFORT, NEVER BLOCKING. The action it records has already happened
 * by the time it is appended; failing the request now would tell the caller
 * a publish failed that in fact succeeded. A failed append is logged loudly.
 */

const crypto = require('crypto');
const { kv } = require('./kv-client');

const AUDIT_PREFIX = 'org-audit:';
const MAX_PAGE = 200;
const TYPES = new Set([
  'publish',
  'visibility_change',
  'visibility_request',
  'visibility_decision',
  'yank',
  'unyank',
  'delete_version',
  'delete_package',
]);

function actorOf(user, via) {
  if (!user) return { id: null, via: via || 'unknown' };
  return {
    id: user.email || user.sub || null,
    via: via || (user.cloud ? 'cloud' : 'registry'),
    ...(user.cloud
      ? {
          cloud_org_id: user.cloudOrgId,
          role: user.role,
          ...(user.via === 'api_key'
            ? { api_key: true, key_id: user.keyId }
            : {}),
        }
      : {}),
  };
}

/**
 * @param {string|null} orgId - nothing is written for a package with no org
 * @param {{type: string, package: string, version?: string, user?: object, via?: string, details?: object}} event
 */
async function appendAudit(orgId, event) {
  if (!orgId || !TYPES.has(event?.type)) return null;
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    type: event.type,
    org_id: orgId,
    package: event.package,
    ...(event.version ? { version: event.version } : {}),
    actor: actorOf(event.user, event.via),
    ...(event.details ? { details: event.details } : {}),
  };
  try {
    await kv.rPush(AUDIT_PREFIX + orgId, JSON.stringify(entry));
    return entry;
  } catch (err) {
    console.error('AUDIT APPEND FAILED', orgId, entry, err);
    return null;
  }
}

/**
 * Newest first. `offset` counts back from the newest event.
 * @returns {Promise<{events: object[], total: number}>}
 */
async function listAudit(orgId, { limit = 50, offset = 0 } = {}) {
  const n = Math.min(Math.max(1, Number(limit) || 50), MAX_PAGE);
  const skip = Math.max(0, Number(offset) || 0);
  const key = AUDIT_PREFIX + orgId;
  const total = Number(await kv.lLen(key)) || 0;
  const stop = total - 1 - skip;
  if (stop < 0) return { events: [], total };
  const start = Math.max(0, stop - n + 1);
  const raws = await kv.lRange(key, start, stop);
  const events = raws
    .map(r => {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
  return { events, total };
}

module.exports = { appendAudit, listAudit, AUDIT_PREFIX, TYPES, MAX_PAGE };
