/** GET /api/admin/check — returns { isAdmin: bool } */
const { requireAuth } = require('../lib/auth-helpers');
const { isAdmin } = require('../lib/admin-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await requireAuth(req, res);
  if (!user) return;
  return res.status(200).json({ isAdmin: await isAdmin(user.email) });
};
