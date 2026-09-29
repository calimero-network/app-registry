/**
 * User profile storage (Redis).
 * Keys:
 *   user:{userId}          → JSON { id, email, username, verified, name, picture, createdAt }
 *   username:{username}    → userId  (uniqueness index)
 *   email2user:{email}     → userId  (reverse lookup)
 */

const { kv } = require('./kv-client');

const USER_PREFIX = 'user:';
const USERNAME_PREFIX = 'username:';
const EMAIL2USER_PREFIX = 'email2user:';

// Usernames are the public author shown on packages and /developers/<name>,
// so a freed username would let a new account re-claim a deleted user's name
// and appear as the author of their packages. On delete
// we write this sentinel to username:<name> instead of deleting the key, so the
// name stays occupied and claimUsername refuses it. Not a valid userId, so
// getUserByUsername resolves it to null (no user, no hijack).
const USERNAME_TOMBSTONE = 'retired:deleted-user';

// 2-50 chars: starts & ends with letter or number, may contain _ or - in between
const USERNAME_REGEX = /^[a-z0-9]([a-z0-9_-]{0,48}[a-z0-9])?$/;

// Reserved names and common profanity — exact-match or substring check
const BLOCKED_TERMS = new Set([
  // Profanity
  'fuck',
  'shit',
  'ass',
  'bitch',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'cock',
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'whore',
  'slut',
  'retard',
  'rape',
  'piss',
  'prick',
  'twat',
  'wanker',
  'asshole',
  'arsehole',
  'bullshit',
  // Hate / extremist
  'nazi',
  'hitler',
  // Reserved system names
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'moderator',
  'calimero',
  'calimeronetwork',
]);

function containsBlockedTerm(username) {
  const lower = username.toLowerCase().replace(/[-_]/g, '');
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term)) return true;
  }
  return false;
}

/**
 * Get or create a user profile from a Google OAuth payload.
 * Preserves username if already set. Updates name/picture/verified on every login.
 * @param {{ id: string, email: string, name: string, picture: string|null }} googleUser
 * @returns {Promise<object>} full user profile
 */
async function getOrCreateUser(googleUser) {
  const { id, email, name, picture } = googleUser;
  const emailNorm = (email || '').toLowerCase();
  const verified = emailNorm.endsWith('@calimero.network');

  const rawUserId = await kv.get(EMAIL2USER_PREFIX + emailNorm);
  if (rawUserId) {
    const userId =
      typeof rawUserId === 'string' ? rawUserId : String(rawUserId);
    const raw = await kv.get(USER_PREFIX + userId);
    if (raw) {
      const existing = JSON.parse(typeof raw === 'string' ? raw : String(raw));
      const updated = {
        ...existing,
        name: name || existing.name,
        picture: picture || existing.picture,
        verified,
      };
      await kv.set(USER_PREFIX + userId, JSON.stringify(updated));
      return updated;
    }
  }

  const user = {
    id,
    email: emailNorm,
    name: name || emailNorm,
    picture: picture || null,
    username: null,
    verified,
    createdAt: new Date().toISOString(),
  };
  await kv.set(USER_PREFIX + id, JSON.stringify(user));
  await kv.set(EMAIL2USER_PREFIX + emailNorm, id);
  return user;
}

/**
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function getUserByEmail(email) {
  if (!email) return null;
  const norm = email.toLowerCase();
  const rawId = await kv.get(EMAIL2USER_PREFIX + norm);
  if (!rawId) return null;
  return getUserById(typeof rawId === 'string' ? rawId : String(rawId));
}

/**
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getUserById(userId) {
  if (!userId) return null;
  const raw = await kv.get(USER_PREFIX + String(userId));
  if (!raw) return null;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return null;
  }
}

/**
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function getUserByUsername(username) {
  if (!username) return null;
  const norm = username.toLowerCase();
  const rawId = await kv.get(USERNAME_PREFIX + norm);
  if (!rawId) return null;
  return getUserById(typeof rawId === 'string' ? rawId : String(rawId));
}

/**
 * Claim a username for an existing user. Can only be done once.
 * @param {string} userId
 * @param {string} username
 * @returns {Promise<object>} updated user profile
 * @throws {{ message: string, code: string }}
 */
async function claimUsername(userId, username) {
  const norm = username.toLowerCase();
  if (!USERNAME_REGEX.test(norm)) {
    const err = new Error(
      'Username must be 2–50 characters, use only letters, numbers, underscores, or hyphens, and start and end with a letter or number'
    );
    err.code = 'invalid_format';
    throw err;
  }
  if (containsBlockedTerm(norm)) {
    const err = new Error('This username is not allowed');
    err.code = 'blocked';
    throw err;
  }
  const uid = String(userId);
  const readProfile = async () => {
    const raw = await kv.get(USER_PREFIX + uid);
    return raw ? JSON.parse(typeof raw === 'string' ? raw : String(raw)) : null;
  };
  const user = await readProfile();
  if (!user) {
    const err = new Error('User not found');
    err.code = 'not_found';
    throw err;
  }
  const immutable = () => {
    const err = new Error(
      'Username has already been set and cannot be changed'
    );
    err.code = 'immutable';
    return err;
  };
  if (user.username) throw immutable();

  // Reserve the index FIRST and atomically. A read-then-write here let two
  // concurrent claims of the same name both pass the check and both succeed.
  const indexKey = USERNAME_PREFIX + norm;
  const reserved = await kv.setNX(indexKey, uid);
  if (!reserved) {
    const existingOwner = await kv.get(indexKey);
    // A tombstoned name belongs to a deleted account and must never be
    // re-claimed, otherwise the claimant inherits that account's packages
    // (owned by username).
    if (existingOwner && String(existingOwner) === USERNAME_TOMBSTONE) {
      const err = new Error('This username is not available');
      err.code = 'retired';
      throw err;
    }
    // The index already points at this user (an earlier claim that stopped
    // before the profile write): finish that claim instead of refusing it.
    if (!existingOwner || String(existingOwner) !== uid) {
      const err = new Error('This username is already taken');
      err.code = 'taken';
      throw err;
    }
  }

  const release = async () => {
    if (reserved) await kv.del(indexKey);
  };
  try {
    // Re-read: a concurrent claim of a DIFFERENT name by the same user may
    // have landed between the first read and the reservation.
    const current = await readProfile();
    if (!current) {
      await release();
      const err = new Error('User not found');
      err.code = 'not_found';
      throw err;
    }
    if (current.username && current.username !== norm) {
      await release();
      throw immutable();
    }
    current.username = norm;
    await kv.set(USER_PREFIX + uid, JSON.stringify(current));
    return current;
  } catch (err) {
    if (!err.code) await release();
    throw err;
  }
}

/**
 * Tombstone a username so it can never be re-claimed (see USERNAME_TOMBSTONE).
 * Called on user delete instead of freeing the name.
 */
async function retireUsername(username) {
  if (!username) return;
  await kv.set(USERNAME_PREFIX + username.toLowerCase(), USERNAME_TOMBSTONE);
}

module.exports = {
  getOrCreateUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  claimUsername,
  retireUsername,
  USERNAME_TOMBSTONE,
  USERNAME_REGEX,
};
