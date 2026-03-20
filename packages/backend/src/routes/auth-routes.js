const rateLimit = require('@fastify/rate-limit');
const {
  buildGoogleAuthUrl,
  exchangeCodeForUser,
  createSessionToken,
  verifySessionToken,
  generateState,
  createApiToken,
  verifyApiToken,
  listApiTokens,
  revokeApiToken,
} = require('../lib/auth');
const {
  getOrCreateUser,
  getUserById,
  getUserByEmail,
  claimUsername,
} = require('../lib/user-storage');
const { isAdmin, isBlacklisted } = require('../lib/admin-storage');

const STATE_COOKIE_NAME = 'oauth_state';
const STATE_MAX_AGE = 600; // 10 minutes

async function authRoutes(server, options) {
  // Rate limit all auth endpoints: 20 requests per IP per minute
  await server.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    keyGenerator: request => request.ip,
    errorResponseBuilder: () => ({
      error: 'too_many_requests',
      message: 'Too many auth requests. Please wait before trying again.',
    }),
  });
  const config = options.config;
  if (!config) throw new Error('auth-routes: config is required');
  const authConfig = config.auth || {};
  const {
    sessionSecret,
    frontendUrl,
    cookieName,
    cookieMaxAge,
    google: { clientId, clientSecret },
  } = authConfig;

  const redirectUri = `${frontendUrl}/api/auth/google/callback`;
  const isSecure = frontendUrl.startsWith('https://');

  /** Resolve current user from session cookie or Bearer token. Returns null if unauthenticated. */
  async function resolveUser(request) {
    // Try session cookie first
    const token = request.cookies?.[cookieName];
    const sessionUser = await verifySessionToken(token, sessionSecret);
    if (sessionUser?.email) return sessionUser;
    // Try Bearer token
    const auth = request.headers?.['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const tokenData = await verifyApiToken(auth.slice(7));
      if (tokenData?.email)
        return {
          id: tokenData.email,
          email: tokenData.email,
          name: tokenData.name,
          picture: null,
        };
    }
    return null;
  }

  // GET /api/auth/google — redirect to Google OAuth
  server.get('/api/auth/google', async (request, reply) => {
    try {
      if (!clientId) {
        return reply.code(503).send({
          error: 'auth_not_configured',
          message: 'Google OAuth is not configured (GOOGLE_CLIENT_ID missing)',
        });
      }
      const state = generateState();
      reply.setCookie(STATE_COOKIE_NAME, state, {
        path: '/',
        httpOnly: true,
        maxAge: STATE_MAX_AGE,
        sameSite: 'lax',
        secure: isSecure,
      });
      const url = buildGoogleAuthUrl(redirectUri, clientId, state);
      return reply.redirect(302, url);
    } catch (err) {
      server.log.error({ err }, 'GET /api/auth/google failed');
      return reply.code(500).send({
        error: 'server_error',
        message: 'Auth redirect failed. Check server logs.',
      });
    }
  });

  // GET /api/auth/google/callback — exchange code, set session, redirect to frontend
  server.get('/api/auth/google/callback', async (request, reply) => {
    if (!clientId || !clientSecret) {
      reply.clearCookie(STATE_COOKIE_NAME, { path: '/' });
      return reply.redirect(302, `${frontendUrl}?error=auth_not_configured`);
    }
    const { code, state: queryState } = request.query || {};
    const cookieState = request.cookies?.[STATE_COOKIE_NAME];
    reply.clearCookie(STATE_COOKIE_NAME, { path: '/' });

    if (!queryState || queryState !== cookieState) {
      return reply.redirect(302, `${frontendUrl}?error=invalid_state`);
    }
    if (!code) {
      return reply.redirect(302, `${frontendUrl}?error=missing_code`);
    }

    let user;
    try {
      user = await exchangeCodeForUser(
        code,
        redirectUri,
        clientId,
        clientSecret
      );
    } catch (err) {
      server.log.warn({ err }, 'Google OAuth exchange failed');
      return reply.redirect(302, `${frontendUrl}?error=oauth_failed`);
    }

    // Block blacklisted users
    if (await isBlacklisted(user.email)) {
      return reply.redirect(302, `${frontendUrl}?error=account_suspended`);
    }

    // Create or update user profile in Redis (username/verified persistence)
    await getOrCreateUser(user);

    const token = await createSessionToken(
      user,
      sessionSecret,
      authConfig.cookieMaxAge ?? cookieMaxAge
    );

    reply.setCookie(cookieName, token, {
      path: '/',
      httpOnly: true,
      maxAge: authConfig.cookieMaxAge ?? cookieMaxAge,
      sameSite: 'lax',
      secure: isSecure,
    });

    return reply.redirect(302, `${frontendUrl}/my-packages`);
  });

  // GET /api/auth/me — return current user from session cookie or Bearer token
  server.get('/api/auth/me', async (request, reply) => {
    const user = await resolveUser(request);
    if (!user) {
      return reply
        .code(401)
        .send({ error: 'unauthorized', message: 'Not signed in' });
    }
    // Enrich with username and verified from Redis profile
    const profile =
      (await getUserById(user.id)) || (await getUserByEmail(user.email));
    const username = profile?.username ?? null;
    const verified =
      profile?.verified ?? (user.email || '').endsWith('@calimero.network');
    const adminFlag = await isAdmin(user.email || '');
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        username,
        verified,
        isAdmin: adminFlag,
      },
    };
  });

  // POST /api/auth/username — claim a username (immutable once set)
  server.post('/api/auth/username', async (request, reply) => {
    const user = await resolveUser(request);
    if (!user) {
      return reply
        .code(401)
        .send({ error: 'unauthorized', message: 'Login required' });
    }
    const { username } = request.body || {};
    if (!username || typeof username !== 'string') {
      return reply
        .code(400)
        .send({ error: 'bad_request', message: 'username is required' });
    }
    try {
      const updated = await claimUsername(user.id, username.trim());
      return reply.code(200).send({ username: updated.username });
    } catch (err) {
      const code = err.code;
      if (code === 'invalid_format')
        return reply
          .code(400)
          .send({ error: 'invalid_format', message: err.message });
      if (code === 'blocked')
        return reply.code(400).send({ error: 'blocked', message: err.message });
      if (code === 'taken')
        return reply.code(409).send({ error: 'taken', message: err.message });
      if (code === 'immutable')
        return reply
          .code(409)
          .send({ error: 'immutable', message: err.message });
      server.log.error({ err }, 'POST /api/auth/username failed');
      return reply
        .code(500)
        .send({ error: 'server_error', message: 'Failed to set username' });
    }
  });

  // GET /api/users/resolve?emails=e1,e2,e3 — batch resolve emails to { username, verified }
  // Returns: { [email]: { username: string|null, verified: boolean } }
  server.get('/api/users/resolve', async (request, reply) => {
    const raw = request.query?.emails;
    if (!raw || typeof raw !== 'string') {
      return reply.send({});
    }
    const emails = raw
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 50);
    const result = {};
    await Promise.all(
      emails.map(async email => {
        const profile = await getUserByEmail(email);
        result[email] = {
          username: profile?.username ?? null,
          verified: profile?.verified ?? email.endsWith('@calimero.network'),
        };
      })
    );
    return reply.send(result);
  });

  // POST /api/auth/logout — clear session cookie
  server.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie(cookieName, { path: '/' });
    return reply.code(204).send();
  });

  // POST /api/auth/token — create a new API token (requires session or existing Bearer token)
  server.post('/api/auth/token', async (request, reply) => {
    const user = await resolveUser(request);
    if (!user) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Login required to create API tokens',
      });
    }
    const label =
      typeof request.body?.label === 'string'
        ? request.body.label.trim() || 'CLI token'
        : 'CLI token';
    const pubkey =
      typeof request.body?.pubkey === 'string'
        ? request.body.pubkey.trim()
        : undefined;
    const result = await createApiToken(user.email, user.name, label, pubkey);
    return reply.code(201).send({
      token: result.token,
      label: result.label,
      createdAt: result.createdAt,
    });
  });

  // GET /api/auth/tokens — list API tokens for current user (masked)
  server.get('/api/auth/tokens', async (request, reply) => {
    const user = await resolveUser(request);
    if (!user) {
      return reply
        .code(401)
        .send({ error: 'unauthorized', message: 'Login required' });
    }
    const tokens = await listApiTokens(user.email);
    return reply.send({ tokens });
  });

  // DELETE /api/auth/token/:tokenId — revoke a token by its first-8-char ID prefix
  // For security, user must be logged in with session (not just a token) to revoke
  server.delete('/api/auth/token/:tokenId', async (request, reply) => {
    const sessionToken = request.cookies?.[cookieName];
    const sessionUser = await verifySessionToken(sessionToken, sessionSecret);
    if (!sessionUser?.email) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Session login required to revoke tokens',
      });
    }
    const { tokenId } = request.params;
    if (!tokenId || typeof tokenId !== 'string') {
      return reply
        .code(400)
        .send({ error: 'bad_request', message: 'tokenId required' });
    }
    // Find the full token by prefix match among user's tokens
    const { kv } = require('../lib/kv-client');
    const USER_TOKENS_PREFIX = 'user_tokens:';
    const TOKEN_PREFIX = 'apitoken:';
    const allTokens = await kv.sMembers(USER_TOKENS_PREFIX + sessionUser.email);
    const match = Array.isArray(allTokens)
      ? allTokens.find(t => t.startsWith(tokenId))
      : null;
    if (!match) {
      return reply
        .code(404)
        .send({ error: 'not_found', message: 'Token not found' });
    }
    await revokeApiToken(sessionUser.email, match);
    await kv.del(TOKEN_PREFIX + match);
    return reply.code(204).send();
  });
}

module.exports = authRoutes;
