const { SignJWT, jwtVerify } = require('jose');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const SCOPES = ['openid', 'email', 'profile'];

/**
 * Build Google OAuth authorization URL. redirectUri must be the callback URL
 * the browser will hit (e.g. frontend origin + /api/auth/google/callback).
 */
function buildGoogleAuthUrl(redirectUri, clientId, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: state || '',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens and fetch user profile.
 */
async function exchangeCodeForUser(code, redirectUri, clientId, clientSecret) {
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

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(
      `Google token exchange failed: ${tokenRes.status} ${errText}`
    );
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  if (!accessToken) {
    throw new Error('Google did not return access_token');
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    throw new Error(`Google userinfo failed: ${userRes.status}`);
  }

  const user = await userRes.json();
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    picture: user.picture,
  };
}

/**
 * Create a JWT for the session (payload: { sub, email, name }).
 */
async function createSessionToken(payload, secret, maxAgeSeconds) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    sub: payload.id,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(key);
}

/**
 * Verify session JWT and return payload or null.
 */
async function verifySessionToken(token, secret) {
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

function generateState() {
  const array = new Uint8Array(24);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.getRandomValues
  ) {
    globalThis.crypto.getRandomValues(array);
  } else {
    const NodeCrypto = require('crypto');
    NodeCrypto.randomFillSync(array);
  }
  return Buffer.from(array).toString('base64url');
}

module.exports = {
  buildGoogleAuthUrl,
  exchangeCodeForUser,
  createSessionToken,
  verifySessionToken,
  generateState,
};
