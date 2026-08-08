/**
 * POST /api/auth/refresh — trade a refresh cookie for a fresh session cookie.
 *
 * The refresh token is single-use: each call retires the presented token and
 * issues a new one, so a leaked token is only good until the real client next
 * refreshes. What to answer is decided in shared/refresh-flow.js; this handler
 * only signs the session and writes cookies.
 */

const jwt = require('jsonwebtoken');
const { refresh } = require('../lib/refresh-storage');
const { getUserByEmail } = require('../lib/user-storage');
const { isBlacklisted } = require('../lib/admin-storage');
const {
  refreshSession,
} = require('@calimero-network/registry-shared/refresh-flow');
const {
  SESSION_MAX_AGE,
  refreshCookieName,
  sessionCookie,
  refreshCookie,
  clearedSessionCookie,
  clearedRefreshCookie,
} = require('@calimero-network/registry-shared/session-cookies');

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Checked before configuration: a caller with no refresh cookie is
  // unauthenticated whatever the server is missing, and answering 401 keeps a
  // misconfigured deployment from reporting its own state to anonymous callers.
  const presented = parseCookies(req)[refreshCookieName()];
  if (!presented) {
    return res
      .status(401)
      .json({ error: 'no_refresh_token', message: 'No refresh token' });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return res
      .status(500)
      .json({ error: 'not_configured', message: 'SESSION_SECRET is not set' });
  }

  try {
    const result = await refreshSession(
      { refresh, isBlacklisted, getUserByEmail },
      presented
    );

    if (!result.ok) {
      if (result.clearCookies) {
        res.setHeader('Set-Cookie', [
          clearedSessionCookie(),
          clearedRefreshCookie(),
        ]);
      }
      return res
        .status(result.status)
        .json({ error: result.error, message: result.message });
    }

    const token = jwt.sign(result.claims, sessionSecret, {
      algorithm: 'HS256',
      expiresIn: SESSION_MAX_AGE,
    });

    res.setHeader('Set-Cookie', [
      sessionCookie(token),
      refreshCookie(result.refreshToken),
    ]);
    return res.status(200).json({ email: result.email });
  } catch (err) {
    // Redis going down must not read as a rejected session: cookies are left
    // alone so a retry can still succeed, rather than signing the user out
    // over a transient fault. The blacklist re-check lives inside this try, so
    // a failure there fails closed with no session issued.
    console.error('POST /api/auth/refresh error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Could not refresh session' });
  }
};
