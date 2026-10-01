/**
 * Admin user management.
 * DELETE /api/admin/users/:userId      — delete user
 * PATCH  /api/admin/users/:userId      — body: { action: 'verify'|'unverify'|'make_admin'|'remove_admin'|'blacklist'|'unblacklist'|'revoke_tokens', reason? }
 */
const { requireAdmin } = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const { refresh } = require('#api-lib/refresh-storage');
const { retireUsername } = require('#api-lib/user-storage');
const {
  addAdmin,
  removeAdmin,
  revokeAdmin,
  blacklistUser,
  unblacklistUser,
  setAdminVerified,
} = require('#api-lib/admin-storage');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

// Blacklist blocks resolveUser via isBlacklisted, but a deleted profile does
// not, so both paths must revoke API tokens explicitly. Deletes every
// apitoken:<member> in the user's set (members are hashes for new tokens, raw
// values for legacy ones) then the set itself.
async function revokeAllApiTokens(email) {
  if (!email) return;
  const setKey = USER_TOKENS_PREFIX + email;
  const members = await kv.sMembers(setKey);
  const list = Array.isArray(members) ? members : [];
  await Promise.all(list.map(m => kv.del(TOKEN_PREFIX + m)));
  await kv.del(setKey);
  return list.length;
}

// Ends every credential the account holds (API tokens and refresh sessions)
// while leaving the profile, packages and memberships in place.
async function revokeAllCredentials(email) {
  const apiTokens = await revokeAllApiTokens(email);
  const refreshTokens = await refresh.revokeAllForEmail(email);
  return { apiTokens, refreshTokens };
}

const sameEmail = (a, b) =>
  String(a || '').toLowerCase() === String(b || '').toLowerCase();

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.query;
  if (!userId)
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'userId required' });

  // Load the user profile
  const raw = await kv.get(`user:${userId}`);
  if (!raw)
    return res
      .status(404)
      .json({ error: 'not_found', message: 'User not found' });
  let user;
  try {
    user = JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return res.status(500).json({ error: 'parse_error' });
  }

  if (req.method === 'DELETE') {
    // Revoke manual admin + verification so re-registration does not inherit them
    if (user.email) await removeAdmin(user.email);
    await setAdminVerified('user', userId, false);
    // End live sessions too: a refresh cookie outlives the profile otherwise,
    // and the refresh flow would keep renewing it.
    if (user.email) await refresh.revokeAllForEmail(user.email);
    // Revoke API tokens too: otherwise a deleted user's Bearer tokens keep
    // resolving (delete does not blacklist, so isBlacklisted would not stop them).
    if (user.email) await revokeAllApiTokens(user.email);
    // Delete user profile + indexes
    await kv.del(`user:${userId}`);
    if (user.email) await kv.del(`email2user:${user.email.toLowerCase()}`);
    // Tombstone (not delete) the username so it cannot be re-claimed to hijack
    // the deleted user's packages.
    if (user.username) await retireUsername(user.username);
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { action, reason } = req.body || {};
    const email = user.email;

    switch (action) {
      case 'verify':
        await setAdminVerified('user', userId, true);
        user.verified = true;
        await kv.set(`user:${userId}`, JSON.stringify(user));
        return res.status(200).json({ ok: true });

      case 'unverify':
        await setAdminVerified('user', userId, false);
        // Only remove verified if it wasn't from @calimero.network
        if (email && !email.endsWith('@calimero.network')) {
          user.verified = false;
          await kv.set(`user:${userId}`, JSON.stringify(user));
        }
        return res.status(200).json({ ok: true });

      case 'make_admin':
        if (!email) return res.status(400).json({ error: 'no_email' });
        await addAdmin(email);
        return res.status(200).json({ ok: true });

      case 'remove_admin':
        if (!email) return res.status(400).json({ error: 'no_email' });
        if (sameEmail(email, admin.email)) {
          return res.status(400).json({
            error: 'cannot_remove_self',
            message: 'Cannot remove admin access from your own account',
          });
        }
        await revokeAdmin(email);
        return res.status(200).json({ ok: true });

      case 'blacklist':
        if (!email) return res.status(400).json({ error: 'no_email' });
        // Any account can be suspended, including @calimero.network ones, so
        // an admin granted by domain can be offboarded. Only self-suspension
        // is refused, since it would lock the acting admin out.
        if (sameEmail(email, admin.email)) {
          return res.status(400).json({
            error: 'cannot_blacklist_self',
            message: 'Cannot blacklist your own account',
          });
        }
        await blacklistUser(email, reason, admin.email);
        // isBlacklisted stops future resolveUser calls, but revoke the tokens
        // and sessions outright so nothing depends on that check staying in place.
        await revokeAllCredentials(email);
        return res.status(200).json({ ok: true });

      case 'unblacklist':
        if (!email) return res.status(400).json({ error: 'no_email' });
        await unblacklistUser(email);
        return res.status(200).json({ ok: true });

      case 'revoke_tokens': {
        if (!email) return res.status(400).json({ error: 'no_email' });
        const revoked = await revokeAllCredentials(email);
        return res.status(200).json({ ok: true, revoked });
      }

      default:
        return res
          .status(400)
          .json({ error: 'bad_action', message: 'Unknown action' });
    }
  }

  return res.status(405).end();
};
