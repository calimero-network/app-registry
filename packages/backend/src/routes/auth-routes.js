const rateLimit = require('@fastify/rate-limit');
const {
  buildGoogleAuthUrl,
  exchangeCodeForUser,
  createSessionToken,
  verifySessionToken,
  generateState,
} = require('../lib/auth');

const STATE_COOKIE_NAME = 'oauth_state';
const STATE_MAX_AGE = 600; // 10 minutes

async function authRoutes(server, options) {
  // Rate limit all auth endpoints: 20 requests per IP per minute
  await server.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
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

  // GET /api/auth/me — return current user from session cookie
  server.get('/api/auth/me', async (request, reply) => {
    const token = request.cookies?.[cookieName];
    const user = await verifySessionToken(token, sessionSecret);
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Not signed in' });
    }
    return { user: { id: user.id, email: user.email, name: user.name, picture: user.picture } };
  });

  // POST /api/auth/logout — clear session cookie
  server.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie(cookieName, { path: '/' });
    return reply.code(204).send();
  });
}

module.exports = authRoutes;
