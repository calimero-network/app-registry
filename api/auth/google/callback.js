/**
 * GET /api/auth/google/callback — exchange OAuth code for session cookie
 */

const jwt = require('jsonwebtoken');
const { getOrCreateUser } = require('#api-lib/user-storage');
const { isBlacklisted } = require('#api-lib/admin-storage');
const { refresh } = require('#api-lib/refresh-storage');
const {
  parseCookies,
  SESSION_MAX_AGE,
  sessionCookie,
  refreshCookie,
} = require('@calimero-network/registry-shared/session-cookies');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const STATE_COOKIE = 'oauth_state';

function loginErrorUrl(frontendUrl, error) {
  return `${frontendUrl}/login?error=${encodeURIComponent(error)}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const frontendUrl =
    process.env.FRONTEND_URL || 'https://apps.calimero.network';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const redirectUri = `${frontendUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return res.redirect(loginErrorUrl(frontendUrl, 'auth_not_configured'));
  }

  const { code, state: queryState } = req.query || {};
  const cookies = parseCookies(req.headers.cookie);
  const cookieState = cookies[STATE_COOKIE];

  // Clear state cookie
  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`
  );

  if (!queryState || queryState !== cookieState) {
    res.setHeader('Location', loginErrorUrl(frontendUrl, 'invalid_state'));
    return res.status(302).end();
  }
  if (!code) {
    res.setHeader('Location', loginErrorUrl(frontendUrl, 'missing_code'));
    return res.status(302).end();
  }

  // Exchange code for tokens
  let user;
  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!tokenRes.ok)
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access_token returned');

    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new Error(`Userinfo failed: ${userRes.status}`);
    const profile = await userRes.json();
    user = {
      id: profile.id,
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture,
    };
  } catch {
    res.setHeader('Location', loginErrorUrl(frontendUrl, 'oauth_failed'));
    return res.status(302).end();
  }

  // Block blacklisted users before creating a session (fail closed — same as Fastify auth-routes)
  if (await isBlacklisted(user.email)) {
    res.setHeader('Location', loginErrorUrl(frontendUrl, 'account_suspended'));
    return res.status(302).end();
  }

  // Persist user profile in Redis (creates on first login, updates name/picture on subsequent logins)
  try {
    await getOrCreateUser(user);
  } catch {
    // Non-fatal — session still works without Redis profile
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
    sessionSecret,
    { algorithm: 'HS256', expiresIn: SESSION_MAX_AGE }
  );

  const setCookies = [sessionCookie(token)];
  // A failed refresh issue must not block the login: the user still gets a
  // valid session, they just re-authenticate when it lapses.
  try {
    setCookies.push(refreshCookie(await refresh.issue(user.email, user.id)));
  } catch {
    /* session-only login */
  }

  res.setHeader('Set-Cookie', setCookies);
  res.setHeader('Location', `${frontendUrl}/my-packages`);
  return res.status(302).end();
};
