/** GET /api/admin/orgs — list all orgs */
const { requireAdmin } = require('../../lib/auth-helpers');
const { kv } = require('../../lib/kv-client');
const { getAdminVerified } = require('../../lib/admin-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const keys = await kv.keys('org:*');
    const orgs = [];
    for (const key of keys) {
      // Skip non-root org keys (members, roles, packages, slug index)
      if (
        key.includes(':members') ||
        key.includes(':roles') ||
        key.includes(':packages') ||
        key.startsWith('org:by_slug:')
      )
        continue;
      const raw = await kv.get(key);
      if (!raw) continue;
      try {
        const org = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (!org.id || !org.name) continue;
        const adminVerified = await getAdminVerified('org', org.id);
        orgs.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          verified: org.verified || adminVerified,
          adminVerified,
          createdAt: org.created_at || null,
          metadata: org.metadata || null,
        });
      } catch {
        /* skip */
      }
    }
    orgs.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ orgs });
  } catch (err) {
    console.error('admin/orgs GET error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err.message });
  }
};
