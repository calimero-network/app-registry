/**
 * API (CLI/Bearer) token storage.
 * Used by both the Vercel serverless API and the Fastify backend.
 *
 * Hardening, kept strictly backward compatible with tokens already in Redis:
 *
 *  - NEW tokens are stored under a SHA-256 of their value (hex), never in the
 *    clear, exactly like refresh tokens, so a dump of Redis does not hand over
 *    usable CLI credentials. The user's token set stores the same hash, not the
 *    raw value.
 *  - LEGACY tokens were stored under the raw value (`apitoken:<token>`) with no
 *    expiry. verify() looks up the hashed key FIRST, then falls back to the raw
 *    key, so those tokens keep resolving untouched. That fallback accepts only
 *    records that are genuinely legacy: no expiresAt and no `hashed` marker.
 *  - NEW tokens carry an expiresAt and are rejected once past it. A record with
 *    NO expiresAt (every legacy token) is accepted until the optional
 *    LEGACY_API_TOKENS_ACCEPTED_UNTIL cutoff (ISO date or epoch ms), and
 *    forever while it is unset. scripts/migrate-legacy-tokens.js re-keys those
 *    records to the hashed form with an expiry before the cutoff is set.
 *
 * This mirrors shared/refresh-storage.js on purpose; the token value is the
 * only thing the client presents, so a single read per lookup is unavoidable.
 */

const crypto = require('crypto');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

// 90 days. Long enough not to disrupt CLI/CI usage, short enough that a token
// leaked from now on does not live forever. Legacy tokens are unaffected.
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
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

// A SHA-256 hex digest: the shape of every key create() writes. Legacy tokens
// were 32-byte base64url values (43 chars), never 64 hex characters.
const HASH_HEX_RE = /^[0-9a-f]{64}$/i;

function isLegacyShaped(value) {
  return !HASH_HEX_RE.test(value);
}

// Legacy records predate hashing and never carried an expiry or the marker.
function isLegacyRecord(rec) {
  return rec.hashed !== true && rec.expiresAt == null;
}

const LEGACY_CUTOFF_ENV = 'LEGACY_API_TOKENS_ACCEPTED_UNTIL';

function parseLegacyCutoff(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const ms = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function createApiTokenStorage(
  kv,
  {
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
    legacyAcceptedUntil = parseLegacyCutoff(process.env[LEGACY_CUTOFF_ENV]),
  } = {}
) {
  /**
   * Mint a new token. Returns the raw token (shown once) plus its metadata and
   * a short tokenId (first 8 hex of the hash) the UI can display and revoke by.
   * `extra` carries optional fields such as a Solana pubkey.
   */
  async function create(email, name, label, extra = {}, nowMs) {
    const token = newToken();
    const now = nowMs ?? Date.now();
    const hash = hashToken(token);
    const data = {
      email,
      name: name || email,
      label: (typeof label === 'string' && label.trim()) || 'CLI token',
      createdAt: new Date(now).toISOString(),
      ...extra,
      // Grandfathering hinges on this field's presence: only tokens that carry
      // an expiresAt can expire. Set after `extra` so it cannot be dropped.
      expiresAt: now + maxAgeSeconds * 1000,
      // Marks a record stored under the hashed key; the legacy raw-key lookup
      // in verify() never accepts a record carrying it.
      hashed: true,
    };
    // Store under the hash, and index the hash (not the raw token) so neither
    // the record key nor the user's set exposes a replayable value.
    await kv.set(TOKEN_PREFIX + hash, JSON.stringify(data));
    await kv.sAdd(USER_TOKENS_PREFIX + email, hash);
    return { token, tokenId: hash.slice(0, 8), ...data };
  }

  /**
   * Resolve a presented token to its stored record, or null.
   * Hashed key first, legacy raw key second; expiry enforced for tokens that
   * carry it; lastUsed updated best-effort.
   * @returns {Promise<object | null>}
   */
  async function verify(token, nowMs) {
    if (!token || typeof token !== 'string' || !token.trim()) return null;
    const value = token.trim();

    // Hashed lookup is the common path for anything minted after this change.
    let key = TOKEN_PREFIX + hashToken(value);
    let rec = readRecord(await kv.get(key));
    if (!rec && isLegacyShaped(value)) {
      // Fall back to the pre-hashing key so existing plaintext tokens still
      // work. This single fallback is what makes the change non-breaking.
      key = TOKEN_PREFIX + value;
      rec = readRecord(await kv.get(key));
      // Only a genuine legacy record may resolve here: those were written
      // before hashing, with no expiry and no hashed marker. Anything else
      // under this key was minted by create() and must be presented raw.
      if (rec && !isLegacyRecord(rec)) rec = null;
    }
    if (!rec || !rec.email) return null;

    const now = nowMs ?? Date.now();
    if (rec.expiresAt == null) {
      if (legacyAcceptedUntil != null && now >= legacyAcceptedUntil) {
        return null;
      }
    } else if (now >= rec.expiresAt) {
      return null;
    }

    // Best-effort usage stamp; a failed write must never fail the request.
    try {
      rec.lastUsed = new Date(now).toISOString();
      await kv.setXX(key, JSON.stringify(rec));
    } catch {
      /* non-fatal */
    }
    return rec;
  }

  return {
    create,
    verify,
    hashToken,
    maxAgeSeconds,
    legacyAcceptedUntil,
    TOKEN_PREFIX,
    USER_TOKENS_PREFIX,
  };
}

module.exports = {
  createApiTokenStorage,
  hashToken,
  isLegacyRecord,
  parseLegacyCutoff,
  LEGACY_CUTOFF_ENV,
  HASH_HEX_RE,
  DEFAULT_MAX_AGE_SECONDS,
  TOKEN_PREFIX,
  USER_TOKENS_PREFIX,
};
