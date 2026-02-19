/**
 * GET /api/auth/google — redirect to Google OAuth consent screen
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = ['openid', 'email', 'profile'];
const STATE_COOKIE = 'oauth_state';
const STATE_MAX_AGE = 600;

function generateState() {
  const array = new Uint8Array(24);
  require('crypto').randomFillSync(array);
  return Buffer.from(array).toString('base64url');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res
      .status(503)
      .json({
        error: 'auth_not_configured',
        message: 'GOOGLE_CLIENT_ID not set',
      });
  }

  const frontendUrl =
    process.env.FRONTEND_URL || 'https://apps.calimero.network';
  const redirectUri = `${frontendUrl}/api/auth/google/callback`;
  const state = generateState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_MAX_AGE}; Secure`
  );
  res.setHeader('Location', `${GOOGLE_AUTH_URL}?${params.toString()}`);
  return res.status(302).end();
};
