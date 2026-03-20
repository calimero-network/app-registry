/** GET /api/admin/users — list all user profiles */
const { requireAdmin } = require('../../lib/auth-helpers');
const { kv } = require('../../lib/kv-client');
const {
  listAdminEmails,
  listBlacklistedEmails,
  getAdminVerified,
} = require('../../lib/admin-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const keys = await kv.keys('user:*');
    const [adminEmails, blacklistedEmails] = await Promise.all([
      listAdminEmails(),
      listBlacklistedEmails(),
    ]);
    const adminSet = new Set(adminEmails.map(e => e.toLowerCase()));
    const blacklistSet = new Set(blacklistedEmails.map(e => e.toLowerCase()));

    const users = [];
    for (const key of keys) {
      const raw = await kv.get(key);
      if (!raw) continue;
      try {
        const user = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (!user.email) continue;
        const adminVerified = await getAdminVerified(
          'user',
          user.id || key.replace('user:', '')
        );
        users.push({
          id: user.id,
          email: user.email,
          username: user.username || null,
          name: user.name || null,
          verified: user.verified || adminVerified,
          adminVerified,
          isAdmin:
            user.email.endsWith('@calimero.network') ||
            adminSet.has(user.email.toLowerCase()),
          isBlacklisted: blacklistSet.has(user.email.toLowerCase()),
          createdAt: user.createdAt || null,
        });
      } catch {
        /* skip malformed */
      }
    }

    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    return res.status(200).json({ users });
  } catch (err) {
    console.error('admin/users GET error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err.message });
  }
};
