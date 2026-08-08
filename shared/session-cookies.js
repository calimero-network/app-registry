/**
 * Session and refresh cookie shapes.
 * Used by both the Vercel serverless API and Fastify backend.
 */

// Deliberately short. The session JWT is stateless, so logout cannot invalidate
// an outstanding one - only waiting it out does. Every hour added here is an
// hour a stolen session cookie keeps working after the user signed out.
// Lengthening it was how staying signed in used to be bought; the refresh
// cookie below now does that instead, and does it revocably. Tunable via
// SESSION_MAX_AGE_SECONDS if a deployment wants a different trade.
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS) || 60 * 60;
const REFRESH_MAX_AGE =
  Number(process.env.REFRESH_MAX_AGE_SECONDS) || 60 * 60 * 24 * 30;

const sessionCookieName = () =>
  process.env.AUTH_COOKIE_NAME || 'app_registry_session';
const refreshCookieName = () => `${sessionCookieName()}_refresh`;

// RFC 6265 sends a cookie only to its own path or a subpath, so /api/auth/refresh
// would leave the sibling /api/auth/logout unable to read the token it revokes.
// This covers every /api/auth/* route, not just those two - deliberately wider
// than needed, because the alternative is moving logout under the refresh path
// and breaking a public URL. Keeps the token off bundle, org and stats traffic,
// which is where the volume is. No /api/auth handler logs or echoes cookies.
const REFRESH_COOKIE_PATH = '/api/auth';

function sessionCookie(token, { maxAge = SESSION_MAX_AGE } = {}) {
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
}

function refreshCookie(token, { maxAge = REFRESH_MAX_AGE } = {}) {
  return `${refreshCookieName()}=${token}; Path=${REFRESH_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
}

const clearedSessionCookie = () => sessionCookie('', { maxAge: 0 });
const clearedRefreshCookie = () => refreshCookie('', { maxAge: 0 });

// Fastify sets cookies from an options object rather than a header string, so
// these carry the same attributes in the shape it wants. Login, refresh and
// logout all go through them, so a change to the hardening flags lands
// everywhere at once instead of needing to be repeated per call site.
function sessionCookieOptions({ maxAge = SESSION_MAX_AGE, secure } = {}) {
  return { path: '/', httpOnly: true, maxAge, sameSite: 'lax', secure };
}

function refreshCookieOptions({ maxAge = REFRESH_MAX_AGE, secure } = {}) {
  return {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    maxAge,
    sameSite: 'lax',
    secure,
  };
}

module.exports = {
  SESSION_MAX_AGE,
  REFRESH_MAX_AGE,
  REFRESH_COOKIE_PATH,
  sessionCookieName,
  refreshCookieName,
  sessionCookie,
  refreshCookie,
  clearedSessionCookie,
  clearedRefreshCookie,
  sessionCookieOptions,
  refreshCookieOptions,
};
