/**
 * POST /api/auth/refresh — trade a refresh cookie for a fresh session cookie.
 *
 * The refresh token is single-use: each call retires the presented token and
 * issues a new one, so a leaked token is only good until the real client next
 * refreshes.
 */

const jwt = require('jsonwebtoken');
const { refresh } = require('../lib/refresh-storage');
const { getUserByEmail } = require('../lib/user-storage');
const { isBlacklisted } = require('../lib/admin-storage');
const {
  SESSION_MAX_AGE,
  refreshCookieName,
  sessionCookie,
  refreshCookie,
  clearedSessionCookie,
  clearedRefreshCookie,
} = require('../../shared/session-cookies');

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

// Status is explicit: a suspended account answers 403 here and on the Fastify
// route, so a client can tell "log in again" from "you are blocked" whichever
// runtime served it.
function signOut(res, status, error, message) {
  res.setHeader('Set-Cookie', [clearedSessionCookie(), clearedRefreshCookie()]);
  return res.status(status).json({ error, message });
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

  const rotated = await refresh.rotate(presented);
  if (!rotated) {
    // Expired, unknown, or already spent. Clear both cookies so the client
    // stops retrying with a credential that will never work again.
    return signOut(res, 401, 'invalid_refresh_token', 'Session expired');
  }

  // Re-check on every refresh rather than only at login, so suspending an
  // account ends its sessions at the next refresh instead of in 30 days.
  if (await isBlacklisted(rotated.email)) {
    await refresh.revokeAllForEmail(rotated.email);
    return signOut(
      res,
      403,
      'account_suspended',
      'This account has been suspended'
    );
  }

  const profile = await getUserByEmail(rotated.email);
  const token = jwt.sign(
    {
      sub: rotated.userId ?? profile?.id,
      email: rotated.email,
      name: profile?.name ?? rotated.email,
      picture: profile?.picture ?? null,
    },
    sessionSecret,
    { algorithm: 'HS256', expiresIn: SESSION_MAX_AGE }
  );

  res.setHeader('Set-Cookie', [
    sessionCookie(token),
    refreshCookie(rotated.token),
  ]);
  return res.status(200).json({ email: rotated.email });
};
