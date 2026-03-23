/**
 * Admin user management.
 * DELETE /api/admin/users/:userId      — delete user
 * PATCH  /api/admin/users/:userId      — body: { action: 'verify'|'unverify'|'make_admin'|'remove_admin'|'blacklist'|'unblacklist', reason? }
 */
const { requireAdmin } = require('../../lib/auth-helpers');
const { kv } = require('../../lib/kv-client');
const {
  addAdmin,
  removeAdmin,
  blacklistUser,
  unblacklistUser,
  setAdminVerified,
} = require('../../lib/admin-storage');

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
    // Delete user profile + indexes
    await kv.del(`user:${userId}`);
    if (user.email) await kv.del(`email2user:${user.email.toLowerCase()}`);
    if (user.username) await kv.del(`username:${user.username.toLowerCase()}`);
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
        if (email.endsWith('@calimero.network')) {
          return res.status(400).json({
            error: 'cannot_remove',
            message: 'Cannot remove admin from @calimero.network accounts',
          });
        }
        await removeAdmin(email);
        return res.status(200).json({ ok: true });

      case 'blacklist':
        if (!email) return res.status(400).json({ error: 'no_email' });
        if (email.endsWith('@calimero.network')) {
          return res.status(400).json({
            error: 'cannot_blacklist',
            message: 'Cannot blacklist @calimero.network accounts',
          });
        }
        await blacklistUser(email, reason, admin.email);
        return res.status(200).json({ ok: true });

      case 'unblacklist':
        if (!email) return res.status(400).json({ error: 'no_email' });
        await unblacklistUser(email);
        return res.status(200).json({ ok: true });

      default:
        return res
          .status(400)
          .json({ error: 'bad_action', message: 'Unknown action' });
    }
  }

  return res.status(405).end();
};
