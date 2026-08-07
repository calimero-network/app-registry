/**
 * Refresh token storage.
 * Used by both the Vercel serverless API and Fastify backend.
 *
 * Tokens are stored under a SHA-256 of their value, never in the clear, so a
 * dump of Redis does not hand over usable sessions. Lookup still costs one
 * read because the client presents the value we hash.
 */

const crypto = require('crypto');

const REFRESH_PREFIX = 'refresh:';
const USER_REFRESH_PREFIX = 'user_refresh:';

// 30 days. Long enough that a normal user never re-authenticates by surprise,
// short enough that an abandoned session does not live forever.
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createRefreshStorage(
  kv,
  { maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS } = {}
) {
  const keyFor = token => REFRESH_PREFIX + hashToken(token);

  async function issue(email, userId, nowMs) {
    const norm = String(email || '').toLowerCase();
    if (!norm) throw new Error('email required');
    const token = newToken();
    const now = nowMs ?? Date.now();
    await kv.set(
      keyFor(token),
      JSON.stringify({
        email: norm,
        userId: userId == null ? null : String(userId),
        createdAt: new Date(now).toISOString(),
        expiresAt: now + maxAgeSeconds * 1000,
      })
    );
    await kv.sAdd(USER_REFRESH_PREFIX + norm, hashToken(token));
    return token;
  }

  // A record that will not parse is unusable either way, so it reads as a bad
  // token rather than escaping as a 500 from whatever route asked.
  function readRecord(raw) {
    if (!raw) return null;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function revoke(token) {
    if (!token) return;
    const hash = hashToken(token);
    const rec = readRecord(await kv.get(REFRESH_PREFIX + hash));
    if (rec?.email) await kv.sRem(USER_REFRESH_PREFIX + rec.email, hash);
    await kv.del(REFRESH_PREFIX + hash);
  }

  /** @returns {Promise<{email: string, userId: string|null} | null>} */
  async function verify(token, nowMs) {
    if (!token) return null;
    const raw = await kv.get(keyFor(token));
    if (!raw) return null;

    // The kv wrapper has no EXPIRE, so expiry is enforced here and the dead
    // record is cleaned up on the way past rather than lingering. A record that
    // will not parse is equally unusable, so it takes the same path.
    const rec = readRecord(raw);
    if (!rec?.expiresAt || (nowMs ?? Date.now()) >= rec.expiresAt) {
      await revoke(token);
      return null;
    }
    return { email: rec.email, userId: rec.userId ?? null };
  }

  /**
   * Single-use: rotating retires the presented token. A leaked token is
   * therefore only good until the legitimate client next refreshes.
   *
   * DEL decides the winner rather than the preceding read: it is atomic and
   * reports how many keys it removed, so of several callers presenting the
   * same token concurrently, exactly one sees a non-zero count and the rest
   * get null instead of a second live token.
   * @returns {Promise<{token: string, email: string, userId: string|null} | null>}
   */
  async function rotate(token, nowMs) {
    const rec = await verify(token, nowMs);
    if (!rec) return null;
    if (!(await kv.del(keyFor(token)))) return null;
    await kv.sRem(USER_REFRESH_PREFIX + rec.email, hashToken(token));
    const next = await issue(rec.email, rec.userId, nowMs);
    return { token: next, email: rec.email, userId: rec.userId };
  }

  /** Used on logout, and the hook a "sign out everywhere" control would call. */
  async function revokeAllForEmail(email) {
    const norm = String(email || '').toLowerCase();
    if (!norm) return 0;
    const hashes = await kv.sMembers(USER_REFRESH_PREFIX + norm);
    const list = Array.isArray(hashes) ? hashes : [];
    for (const h of list) await kv.del(REFRESH_PREFIX + h);
    await kv.del(USER_REFRESH_PREFIX + norm);
    return list.length;
  }

  return { issue, verify, rotate, revoke, revokeAllForEmail, maxAgeSeconds };
}

module.exports = { createRefreshStorage, DEFAULT_MAX_AGE_SECONDS };
