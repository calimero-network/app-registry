/**
 * POST /api/auth/logout — clear session cookie
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';

  res.setHeader(
    'Set-Cookie',
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`
  );
  return res.status(204).end();
};
