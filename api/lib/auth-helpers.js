/**
 * Shared auth helpers for Vercel serverless API.
 * Supports Google OAuth session cookies and Bearer API tokens.
 */

const jwt = require('jsonwebtoken');
const { apiTokens } = require('./api-token-storage');
const { getOrgMemberRole, getPkg2Org, isOrgAdmin } = require('./org-storage');
const { isAdmin, isBlacklisted, isBot } = require('./admin-storage');
const { getUserByEmail } = require('./user-storage');
const {
  CROSS_ORIGIN_FORBIDDEN,
  cookieWriteAllowed,
  isCrossOriginCookieWrite,
} = require('./request-origin');
const {
  parseCookies,
} = require('@calimero-network/registry-shared/session-cookies');
const {
  manifestOwnedByUser,
  createPackagePermissions,
  NOT_OWNER_MESSAGE,
} = require('@calimero-network/registry-shared/package-permissions');

// isOrgAdmin in this module already covers owners; see package-permissions.
const { canManagePackage } = createPackagePermissions({
  getPkg2Org,
  isOrgManager: isOrgAdmin,
  isAdmin,
});

/**
 * Resolve the current user from the session cookie alone, ignoring any Bearer
 * token. For actions that must come from an interactive login rather than a
 * stored credential. Returns { id, email, name, username } or null.
 */
async function resolveSessionUser(req) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) return null;
  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[cookieName];
  if (!token) return null;
  if (!cookieWriteAllowed(req)) return null;
  try {
    const payload = jwt.verify(token, sessionSecret, {
      algorithms: ['HS256'],
    });
    if (payload?.email) {
      if (await isBlacklisted(payload.email)) return null;
      const profile = await getUserByEmail(payload.email);
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        username: profile?.username ?? null,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Resolve current user from Bearer token or session cookie.
 * Returns { email, name, username } or null.
 */
async function resolveUser(req) {
  // Try Bearer token first
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      try {
        // verify() looks up the hashed key first, then the legacy plaintext
        // key, and rejects an expired (non-grandfathered) token — see
        // shared/api-token-storage.js.
        const data = await apiTokens.verify(token);
        if (data?.email) {
          if (await isBlacklisted(data.email)) return null;
          const profile = await getUserByEmail(data.email);
          return {
            email: data.email,
            name: data.name || data.email,
            username: profile?.username ?? null,
          };
        }
      } catch {
        /* fall through */
      }
    }
  }

  return resolveSessionUser(req);
}

/**
 * Require auth. Returns { email, name } or sends 401 and returns null.
 */
const LOGIN_REQUIRED = Object.freeze({
  error: 'unauthorized',
  message:
    'Login required or provide an API token (Authorization: Bearer <token>)',
});

const BOT_FORBIDDEN = Object.freeze({
  error: 'bot_forbidden',
  message: 'Bot accounts may only publish packages and new versions of them',
});

function rejectUnauthenticated(req, res, body = LOGIN_REQUIRED) {
  if (isCrossOriginCookieWrite(req)) {
    return res.status(403).json(CROSS_ORIGIN_FORBIDDEN);
  }
  return res.status(401).json(body);
}

async function requireAuth(req, res) {
  const user = await resolveUser(req);
  if (!user) {
    rejectUnauthenticated(req, res);
    return null;
  }
  // Bots may publish and nothing else. The publish endpoints call resolveUser
  // directly, so denying here confines them to exactly that surface, and any
  // future endpoint guarded by requireAuth excludes them by default.
  if (await isBot(user.email)) {
    res.status(403).json(BOT_FORBIDDEN);
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
  LOGIN_REQUIRED,
  BOT_FORBIDDEN,
  CROSS_ORIGIN_FORBIDDEN,
  rejectUnauthenticated,
  resolveUser,
  resolveSessionUser,
  requireAuth,
  requireOrgAdminOrOwner,
  requireOrgOwner,
  requireAdmin,
  manifestOwnedByUser,
  canManagePackage,
  NOT_OWNER_MESSAGE,
};
