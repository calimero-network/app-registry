/**
 * Shared auth helpers for Vercel serverless API.
 * Supports Google OAuth session cookies and Bearer API tokens.
 */

const jwt = require('jsonwebtoken');
const { kv } = require('./kv-client');
const { getOrgMemberRole } = require('./org-storage');
const { isAdmin, isBlacklisted } = require('./admin-storage');

const TOKEN_PREFIX = 'apitoken:';

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      result[k] = decodeURIComponent(v);
    } catch {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Resolve current user from Bearer token or session cookie.
 * Returns { email, name } or null.
 */
async function resolveUser(req) {
  // Try Bearer token first
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      try {
        const raw = await kv.get(TOKEN_PREFIX + token);
        if (raw) {
          const data = JSON.parse(typeof raw === 'string' ? raw : String(raw));
          if (data?.email) {
            if (await isBlacklisted(data.email)) return null;
            return { email: data.email, name: data.name || data.email };
          }
        }
      } catch {
        /* fall through */
      }
    }
  }

  // Try session cookie
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
    const cookies = parseCookies(req);
    const token = cookies[cookieName];
    if (token) {
      try {
        const payload = jwt.verify(token, sessionSecret, {
          algorithms: ['HS256'],
        });
        if (payload?.email) {
          if (await isBlacklisted(payload.email)) return null;
          return { id: payload.sub, email: payload.email, name: payload.name };
        }
      } catch {
        /* fall through */
      }
    }
  }

  return null;
}

/**
 * Require auth. Returns { email, name } or sends 401 and returns null.
 */
async function requireAuth(req, res) {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({
      error: 'unauthorized',
      message:
        'Login required or provide an API token (Authorization: Bearer <token>)',
    });
    return null;
  }
  return user;
}

/**
 * Require auth + org admin or owner. Returns user or sends error and returns null.
 */
async function requireOrgAdminOrOwner(req, res, orgId) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getOrgMemberRole(orgId, user.email);
  if (role !== 'admin' && role !== 'owner') {
    res.status(403).json({
      error: 'forbidden',
      message: 'Only an organization admin or owner can perform this action',
    });
    return null;
  }
  return user;
}

/**
 * Require auth + org owner only. Returns user or sends error and returns null.
 */
async function requireOrgOwner(req, res, orgId) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const role = await getOrgMemberRole(orgId, user.email);
  if (role !== 'owner') {
    res.status(403).json({
      error: 'forbidden',
      message: 'Only an organization owner can perform this action',
    });
    return null;
  }
  return user;
}

/**
 * Require admin. Returns user or sends 403 and returns null.
 */
async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const admin = await isAdmin(user.email);
  if (!admin) {
    res
      .status(403)
      .json({ error: 'forbidden', message: 'Admin access required' });
    return null;
  }
  return user;
}

module.exports = {
  resolveUser,
  requireAuth,
  requireOrgAdminOrOwner,
  requireOrgOwner,
  requireAdmin,
};
