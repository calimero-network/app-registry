/**
 * Pending organization invitations.
 * Used by both the Vercel serverless API and Fastify backend.
 *
 * Keys:
 *   org_invites:{orgId}        → hash { email: JSON { role, invitedBy, createdAt } }
 *   user_org_invites:{email}   → set of orgIds with a pending invitation
 */

const ORG_INVITES_PREFIX = 'org_invites:';
const USER_INVITES_PREFIX = 'user_org_invites:';
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const INVITABLE_ROLES = new Set(['admin', 'member']);

function normEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function parse(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const data = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function createOrgInvitations(kv, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const orgKey = orgId => ORG_INVITES_PREFIX + orgId;
  const userKey = email => USER_INVITES_PREFIX + email;

  function isLive(invite, nowMs) {
    if (!invite?.createdAt) return false;
    const created = Date.parse(invite.createdAt);
    if (!Number.isFinite(created)) return false;
    return (nowMs ?? Date.now()) - created < ttlMs;
  }

  function withExpiry(invite) {
    const created = Date.parse(invite.createdAt);
    return {
      ...invite,
      expiresAt: new Date(created + ttlMs).toISOString(),
    };
  }

  async function create(orgId, email, { role, invitedBy } = {}, nowMs) {
    const norm = normEmail(email);
    if (!orgId || !norm) throw new Error('orgId and email required');
    const invite = {
      role: INVITABLE_ROLES.has(role) ? role : 'member',
      invitedBy: normEmail(invitedBy) || null,
      createdAt: new Date(nowMs ?? Date.now()).toISOString(),
    };
    await kv.hSet(orgKey(orgId), { [norm]: JSON.stringify(invite) });
    await kv.sAdd(userKey(norm), orgId);
    return withExpiry(invite);
  }

  async function remove(orgId, email) {
    const norm = normEmail(email);
    if (!orgId || !norm) return;
    await kv.hDel(orgKey(orgId), norm);
    await kv.sRem(userKey(norm), orgId);
  }

  async function get(orgId, email, nowMs) {
    const norm = normEmail(email);
    if (!orgId || !norm) return null;
    const invite = parse(await kv.hGet(orgKey(orgId), norm));
    if (!invite) return null;
    if (!isLive(invite, nowMs)) {
      await remove(orgId, norm);
      return null;
    }
    return withExpiry(invite);
  }

  async function listForOrg(orgId, nowMs) {
    if (!orgId) return [];
    const all = (await kv.hGetAll(orgKey(orgId))) || {};
    const out = [];
    for (const [email, raw] of Object.entries(all)) {
      const invite = parse(raw);
      if (!invite || !isLive(invite, nowMs)) {
        await remove(orgId, email);
        continue;
      }
      out.push({ email, ...withExpiry(invite) });
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async function listForEmail(email, nowMs) {
    const norm = normEmail(email);
    if (!norm) return [];
    const orgIds = (await kv.sMembers(userKey(norm))) || [];
    const invites = await Promise.all(
      orgIds.map(async orgId => {
        const invite = await get(orgId, norm, nowMs);
        if (!invite) await kv.sRem(userKey(norm), orgId);
        return invite ? { orgId, ...invite } : null;
      })
    );
    return invites.filter(Boolean);
  }

  async function removeAllForOrg(orgId) {
    if (!orgId) return;
    const all = (await kv.hGetAll(orgKey(orgId))) || {};
    for (const email of Object.keys(all)) {
      await kv.sRem(userKey(email), orgId);
    }
    await kv.del(orgKey(orgId));
  }

  return { create, get, remove, listForOrg, listForEmail, removeAllForOrg };
}

module.exports = {
  createOrgInvitations,
  INVITATION_TTL_MS: DEFAULT_TTL_MS,
};
