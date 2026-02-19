/**
 * GET /api/auth/google/callback — exchange OAuth code for session cookie
 */

const jwt = require('jsonwebtoken');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const STATE_COOKIE = 'oauth_state';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const frontendUrl = process.env.FRONTEND_URL || 'https://apps.calimero.network';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
  const redirectUri = `${frontendUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}?error=auth_not_configured`);
  }

  const { code, state: queryState } = req.query || {};
  const cookies = parseCookies(req);
  const cookieState = cookies[STATE_COOKIE];

  // Clear state cookie
  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`
  );

  if (!queryState || queryState !== cookieState) {
    res.setHeader('Location', `${frontendUrl}?error=invalid_state`);
    return res.status(302).end();
  }
  if (!code) {
    res.setHeader('Location', `${frontendUrl}?error=missing_code`);
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
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
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
    res.setHeader('Location', `${frontendUrl}?error=oauth_failed`);
    return res.status(302).end();
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
    sessionSecret,
    { algorithm: 'HS256', expiresIn: COOKIE_MAX_AGE }
  );

  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`
  );
  res.setHeader('Location', `${frontendUrl}/my-packages`);
  return res.status(302).end();
};
