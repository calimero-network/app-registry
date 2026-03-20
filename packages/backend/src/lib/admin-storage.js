/**
 * Admin storage helpers (Redis) — Fastify backend.
 * Mirrors api/lib/admin-storage.js for local dev.
 */

const { kv } = require('./kv-client');

const ADMIN_SET = 'admin:set';
const BLACKLIST_SET = 'blacklist:set';

async function isAdmin(email) {
  if (!email) return false;
  const norm = email.toLowerCase();
  if (norm.endsWith('@calimero.network')) return true;
  const result = await kv.sIsMember(ADMIN_SET, norm);
  return !!result;
}

async function isBlacklisted(email) {
  if (!email) return false;
  const result = await kv.sIsMember(BLACKLIST_SET, email.toLowerCase());
  return !!result;
}

async function addAdmin(email) {
  await kv.sAdd(ADMIN_SET, email.toLowerCase());
}

async function removeAdmin(email) {
  await kv.sRem(ADMIN_SET, email.toLowerCase());
}

async function blacklistUser(email, reason, byEmail) {
  const norm = email.toLowerCase();
  await kv.sAdd(BLACKLIST_SET, norm);
  await kv.set(
    `blacklist:email:${norm}`,
    JSON.stringify({
      reason: reason || '',
      bannedAt: new Date().toISOString(),
      bannedBy: byEmail || 'admin',
    })
  );
}

async function unblacklistUser(email) {
  const norm = email.toLowerCase();
  await kv.sRem(BLACKLIST_SET, norm);
  await kv.del(`blacklist:email:${norm}`);
}

async function setAdminVerified(type, id, verified) {
  const key = `admin_verified:${type}:${id}`;
  if (verified) {
    await kv.set(key, '1');
  } else {
    await kv.del(key);
  }
}

async function getAdminVerified(type, id) {
  const val = await kv.get(`admin_verified:${type}:${id}`);
  return val === '1';
}

async function listAdminEmails() {
  return kv.sMembers(ADMIN_SET);
}

async function listBlacklistedEmails() {
  return kv.sMembers(BLACKLIST_SET);
}

module.exports = {
  isAdmin,
  isBlacklisted,
  addAdmin,
  removeAdmin,
  blacklistUser,
  unblacklistUser,
  setAdminVerified,
  getAdminVerified,
  listAdminEmails,
  listBlacklistedEmails,
};
