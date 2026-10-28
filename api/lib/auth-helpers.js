/**
 * Shared auth helpers for Vercel serverless API.
 * Supports Google OAuth session cookies, Bearer API tokens and — on the
 * endpoints that opt in — short-lived Calimero Cloud JWTs (see
 * docs/cloud-integration.md).
 */

const jwt = require('jsonwebtoken');
const jose = require('jose');
const { apiTokens } = require('./api-token-storage');
const {
  getOrgMemberRole,
  getPkg2Org,
  isOrgAdmin,
  getOrgIdByCloudOrg,
} = require('./org-storage');
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
const { storageVar } = require('@calimero-network/registry-shared/storage-env');
const {
  manifestOwnedByUser,
  createPackagePermissions,
  NOT_OWNER_MESSAGE,
} = require('@calimero-network/registry-shared/package-permissions');

// isOrgAdmin in this module already covers owners; see package-permissions.
const { canManagePackage: canManageAsRegistryUser } = createPackagePermissions({
  getPkg2Org,
  isOrgManager: isOrgAdmin,
  isAdmin,
});

/**
 * May `user` manage (yank, delete, change visibility of) `pkg`?
 *
 * Registry users: the package author, an admin/owner of its org, or a site
 * admin (shared/package-permissions.js). Cloud users: an `owner`/`admin` of
 * the Cloud org linked to the package's registry org, holding the `publish`
 * scope. A Cloud token is never a site admin.
 */
async function canManagePackage(pkg, manifest, user) {
  if (user?.cloud) {
    if (!hasCloudScope(user, 'publish')) return false;
    if (user.role !== 'owner' && user.role !== 'admin') return false;
    // Lazy: package-records requires this module's siblings, not this one.
    const { packageOrgId } = require('./package-records');
    const orgId = await packageOrgId(pkg);
    if (!orgId) return false;
    return (await getOrgIdByCloudOrg(user.cloudOrgId)) === orgId;
  }
  return canManageAsRegistryUser(pkg, manifest, user);
}

/**
 * Resolve the current user from the session cookie alone, ignoring any Bearer
 * token. For actions that must come from an interactive login rather than a
 * stored credential. Returns { id, email, name, username } or null.
 */
async function resolveSessionUser(req) {
  const sessionSecret = storageVar('SESSION_SECRET');
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
      if (!profile) return null;
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        username: profile.username ?? null,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ── Calimero Cloud JWTs ─────────────────────────────────────────────────────
//
// The Cloud manager (mdma) mints short-lived JWTs for developers acting on
// behalf of a Cloud org and publishes its keys at CLOUD_JWKS_URL. The registry
// never sees a Cloud password or refresh token; it only verifies these.
//
// ⚠️ A CLOUD JWT IS NOT A REGISTRY ACCOUNT. It carries an org, a role and a
// scope, and is accepted only where a handler passes `{ allowCloud: true }`.
// Everything else (API-token minting, usernames, org invitations, admin) keeps
// seeing `null` for it, so a Cloud identity can never be bridged into a full
// registry account just because the email matches.

const CLOUD_ALGORITHMS = ['RS256', 'EdDSA'];
const CLOUD_DEFAULT_AUDIENCE = 'registry';
const CLOUD_DEFAULT_MAX_TTL_SECONDS = 3600;
const CLOUD_CLOCK_TOLERANCE_SECONDS = 30;
// mdma's Cloud org roles are owner / admin / developer; anything that is not
// owner or admin is treated as a plain member (may publish, may not manage).
const CLOUD_ROLES = new Set(['owner', 'admin', 'developer', 'member']);
const CLOUD_SCOPES = new Set(['publish', 'read']);

/** Cloud verification settings, or null when Cloud auth is not configured. */
function cloudJwtConfig() {
  const jwksUrl = storageVar('CLOUD_JWKS_URL');
  const issuer = storageVar('CLOUD_ISSUER');
  if (!jwksUrl || !issuer) return null;
  const maxTtl = Number(storageVar('CLOUD_JWT_MAX_TTL_SECONDS'));
  return {
    jwksUrl,
    issuer,
    audience: storageVar('CLOUD_AUDIENCE') || CLOUD_DEFAULT_AUDIENCE,
    maxTtl:
      Number.isFinite(maxTtl) && maxTtl > 0
        ? maxTtl
        : CLOUD_DEFAULT_MAX_TTL_SECONDS,
  };
}

// One remote key set per URL for the life of the function instance. jose
// caches the fetched JWKS (cacheMaxAge) and refetches on an unknown `kid`, at
// most once per cooldownDuration, so key rotation on the Cloud side needs no
// registry deploy.
const jwksCache = new Map();
function cloudJwks(url) {
  let set = jwksCache.get(url);
  if (!set) {
    set = jose.createRemoteJWKSet(new URL(url), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5000,
    });
    jwksCache.set(url, set);
  }
  return set;
}

/** Test hook: forget fetched key sets so a test can rotate keys. */
function _resetCloudJwksCache() {
  jwksCache.clear();
}

/** A compact JWS: three base64url segments. API tokens never contain dots. */
function looksLikeJwt(token) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

/** `scope` may be a space-separated string (RFC 8693 style) or an array. */
function parseScopes(scope) {
  const list = Array.isArray(scope)
    ? scope
    : typeof scope === 'string'
      ? scope.split(/\s+/)
      : [];
  const scopes = new Set(list.filter(s => CLOUD_SCOPES.has(s)));
  // Publishing implies reading what you publish.
  if (scopes.has('publish')) scopes.add('read');
  return [...scopes].sort();
}

/**
 * Verify a Calimero Cloud JWT from `Authorization: Bearer <jwt>`.
 *
 * Checks signature (RS256/EdDSA against CLOUD_JWKS_URL), `iss`, `aud`, `exp`,
 * `nbf`, the presence of `sub`/`org`/`iat`, and that the token's lifetime is
 * short (exp - iat <= CLOUD_JWT_MAX_TTL_SECONDS). Returns the Cloud user or
 * null — never throws for a bad token.
 *
 * @returns {Promise<null | {email: string, name: string, username: null,
 *   cloud: true, sub: string, cloudOrgId: string, orgSlug: string|null,
 *   role: 'owner'|'admin'|'developer'|'member', scopes: string[],
 *   via: 'cloud'|'api_key', keyId: string|null}>}
 */
async function resolveCloudJwt(req) {
  const config = cloudJwtConfig();
  if (!config) return null;
  const auth = req.headers?.authorization;
  if (typeof auth !== 'string' || !auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = auth.slice(7).trim();
  if (!looksLikeJwt(token)) return null;

  let payload;
  try {
    ({ payload } = await jose.jwtVerify(token, cloudJwks(config.jwksUrl), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: CLOUD_ALGORITHMS,
      clockTolerance: CLOUD_CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['exp', 'iat', 'sub', 'org'],
    }));
  } catch {
    return null;
  }

  // Short-lived means short-lived: a long-lived token minted by mistake is
  // refused rather than trusted for its whole lifetime.
  if (payload.exp - payload.iat > config.maxTtl) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.org !== 'string' || !payload.org) return null;

  const role = CLOUD_ROLES.has(payload.role) ? payload.role : 'member';
  const scopes = parseScopes(payload.scope);
  if (scopes.length === 0) return null;

  const sub = payload.sub;
  const claimedEmail =
    typeof payload.email === 'string' && payload.email.includes('@')
      ? payload.email
      : sub.includes('@')
        ? sub
        : null;
  // The identity recorded as `_ownerEmail` and in the audit log. A Cloud
  // subject that is not an email is namespaced so it can never collide with a
  // registry account's email.
  const email = (claimedEmail || `cloud:${sub}`).toLowerCase();
  if (await isBlacklisted(email)) return null;

  return {
    email,
    name: typeof payload.name === 'string' ? payload.name : email,
    username: null,
    cloud: true,
    sub,
    cloudOrgId: payload.org,
    orgSlug: typeof payload.org_slug === 'string' ? payload.org_slug : null,
    role,
    scopes,
    // `via: "api_key"` + `key_id` mark a token minted from an org API key (CI).
    via: payload.via === 'api_key' ? 'api_key' : 'cloud',
    keyId: typeof payload.key_id === 'string' ? payload.key_id : null,
  };
}

/** True when `user` is a Cloud user holding `scope`. */
function hasCloudScope(user, scope) {
  return !!user?.cloud && user.scopes.includes(scope);
}

/**
 * Resolve current user from Bearer token or session cookie.
 * Returns { email, name, username } or null.
 *
 * With `{ allowCloud: true }` a Calimero Cloud JWT is accepted as well and
 * yields `{ email, name, username: null, cloud: true, sub, cloudOrgId,
 * orgSlug, role, scopes }`. Without it a Cloud JWT is ignored (the request is
 * treated as carrying no Bearer credential).
 */
async function resolveUser(req, { allowCloud = false } = {}) {
  // Try Bearer token first
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token && looksLikeJwt(token)) {
      if (allowCloud) {
        const cloudUser = await resolveCloudJwt(req);
        if (cloudUser) return cloudUser;
      }
    } else if (token) {
      try {
        // verify() looks up the hashed key first, then the legacy plaintext
        // key, and rejects an expired (non-grandfathered) token — see
        // shared/api-token-storage.js.
        const data = await apiTokens.verify(token);
        if (data?.email) {
          if (await isBlacklisted(data.email)) return null;
          const profile = await getUserByEmail(data.email);
          if (!profile) return null;
          return {
            email: data.email,
            name: data.name || data.email,
            username: profile.username ?? null,
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

async function requireAuth(req, res, { allowCloud = false } = {}) {
  const user = await resolveUser(req, { allowCloud });
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

const SESSION_REQUIRED = Object.freeze({
  error: 'unauthorized',
  message:
    'Admin actions require signing in on the registry website; API tokens are not accepted',
});

/**
 * Require a site admin signed in with a session cookie. API tokens are not
 * accepted. Returns user or sends 401/403 and returns null.
 */
async function requireAdmin(req, res) {
  const user = await resolveSessionUser(req);
  if (!user) {
    res.status(401).json(SESSION_REQUIRED);
    return null;
  }
  if (await isBot(user.email)) {
    res.status(403).json(BOT_FORBIDDEN);
    return null;
  }
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
  SESSION_REQUIRED,
  resolveUser,
  resolveSessionUser,
  resolveCloudJwt,
  hasCloudScope,
  looksLikeJwt,
  _resetCloudJwksCache,
  requireAuth,
  requireOrgAdminOrOwner,
  requireOrgOwner,
  requireAdmin,
  manifestOwnedByUser,
  canManagePackage,
  NOT_OWNER_MESSAGE,
};
