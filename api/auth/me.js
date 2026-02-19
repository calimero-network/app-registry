/**
 * GET /api/auth/me — return current user from session cookie
 */

const jwt = require('jsonwebtoken');

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
  const sessionSecret = process.env.SESSION_SECRET;

  const cookies = parseCookies(req);
  const token = cookies[cookieName];

  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Not signed in' });
  }

  try {
    const payload = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] });
    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    });
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' });
  }
};
