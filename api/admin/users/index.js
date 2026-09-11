/** GET /api/admin/users — list all user profiles */
const { requireAdmin } = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const {
  listAdminEmails,
  listBlacklistedEmails,
  getAdminVerified,
} = require('#api-lib/admin-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const keys = await kv.scanKeys('user:*');
    const [adminEmails, blacklistedEmails] = await Promise.all([
      listAdminEmails(),
      listBlacklistedEmails(),
    ]);
    const adminSet = new Set(adminEmails.map(e => e.toLowerCase()));
    const blacklistSet = new Set(blacklistedEmails.map(e => e.toLowerCase()));

    // ⚠️ TWO WAVES, NOT TWO ROUND TRIPS PER USER.
    //
    // This read each `user:*` record and then that user's admin-verified flag
    // one at a time, both `await`ed inside a `for`, so the Users tab cost 2N
    // SERIALISED Redis round trips — the same shape the bundle listing was
    // fixed for, and it grows with every sign-up. Commands issued in one tick
    // are pipelined, so each `Promise.all` here is a single wave regardless of
    // how many accounts exist.
    const keyStrings = keys.map(key =>
      typeof key === 'string'
        ? key
        : Buffer.isBuffer(key)
          ? key.toString('utf8')
          : String(key)
    );

    const raws = await Promise.all(keyStrings.map(k => kv.get(k)));

    // Parse first, so the flag lookups below only cover records that are
    // really going to be listed.
    const parsed = [];
    keyStrings.forEach((keyStr, i) => {
      const raw = raws[i];
      if (!raw) return;
      try {
        const user = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (!user.email) return;
        parsed.push({
          user,
          verifiedId: String(user.id ?? keyStr.replace(/^user:/, '')),
        });
      } catch {
        /* skip malformed */
      }
    });

    const adminVerifiedFlags = await Promise.all(
      parsed.map(p => getAdminVerified('user', p.verifiedId))
    );

    const users = parsed.map(({ user }, i) => {
      const adminVerified = adminVerifiedFlags[i];
      return {
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
      };
    });

    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    return res.status(200).json({ users });
  } catch (err) {
    console.error('admin/users GET error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err.message });
  }
};
