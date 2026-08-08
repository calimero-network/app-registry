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
// `Number(x) || fallback` would discard an explicit 0, which is how an operator
// disables a cookie during an incident. Only unset or unusable values fall back.
function seconds(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

const SESSION_MAX_AGE = seconds('SESSION_MAX_AGE_SECONDS', 60 * 60);
const REFRESH_MAX_AGE = seconds('REFRESH_MAX_AGE_SECONDS', 60 * 60 * 24 * 30);

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

/**
 * Parse a Cookie header. A malformed percent-escape yields the raw value rather
 * than throwing, so one corrupted cookie cannot 500 an entire request.
 */
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

module.exports = {
  parseCookies,
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
