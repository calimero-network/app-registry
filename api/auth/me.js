/**
 * GET /api/auth/me — return current user from session cookie or Bearer API token
 */

const jwt = require('jsonwebtoken');
const { kv } = require('../lib/kv-client');
const { getUserById, getUserByEmail } = require('../lib/user-storage');
const {
  isAdmin,
  getAdminVerified,
  isBlacklisted,
} = require('../lib/admin-storage');

const TOKEN_PREFIX = 'apitoken:';

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (
    auth &&
    typeof auth === 'string' &&
    auth.toLowerCase().startsWith('bearer ')
  ) {
    return auth.slice(7).trim();
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
  const sessionSecret = process.env.SESSION_SECRET;

  // 1) Try Bearer API token
  const bearer = getBearerToken(req);
  if (bearer) {
    try {
      const raw = await kv.get(TOKEN_PREFIX + bearer);
      if (raw) {
        const data = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (await isBlacklisted(data.email)) {
          return res.status(403).json({
            error: 'account_suspended',
            message: 'This account has been suspended',
          });
        }
        const profile = await getUserByEmail(data.email);
        const adminVerified = profile?.id
          ? await getAdminVerified('user', profile.id)
          : false;
        return res.status(200).json({
          user: {
            id: data.email,
            email: data.email,
            name: data.name ?? data.email,
            picture: null,
            username: profile?.username ?? null,
            verified:
              profile?.verified ||
              adminVerified ||
              (data.email || '').endsWith('@calimero.network'),
            isAdmin: await isAdmin(data.email),
          },
        });
      }
    } catch (e) {
      // fall through to cookie
    }
  }

  // 2) Session cookie
  const cookies = parseCookies(req);
  const token = cookies[cookieName];

  if (!token) {
    return res
      .status(401)
      .json({ error: 'unauthorized', message: 'Not signed in' });
  }

  try {
    const payload = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] });
    if (payload?.email && (await isBlacklisted(payload.email))) {
      return res.status(403).json({
        error: 'account_suspended',
        message: 'This account has been suspended',
      });
    }
    const profile =
      (await getUserById(payload.sub)) || (await getUserByEmail(payload.email));
    const adminVerified = profile?.id
      ? await getAdminVerified('user', profile.id)
      : false;
    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        username: profile?.username ?? null,
        verified:
          profile?.verified ||
          adminVerified ||
          (payload.email || '').endsWith('@calimero.network'),
        isAdmin: await isAdmin(payload.email),
      },
    });
  } catch {
    return res
      .status(401)
      .json({ error: 'unauthorized', message: 'Invalid or expired session' });
  }
};
