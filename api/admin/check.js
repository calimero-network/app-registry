/** GET /api/admin/check — returns { isAdmin: bool } */
const {
  resolveSessionUser,
  SESSION_REQUIRED,
} = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await resolveSessionUser(req);
  if (!user) return res.status(401).json(SESSION_REQUIRED);
  return res.status(200).json({ isAdmin: await isAdmin(user.email) });
};
