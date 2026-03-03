const jwt = require('jsonwebtoken');
const { kv } = require('./kv-client');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

/**
 * Create a new API token for the given user.
 * Token is a 32-byte base64url random value. Stored with no expiry.
 * @param {string} email
 * @param {string} name
 * @param {string} [label]
 * @param {string} [pubkey] - optional Solana pubkey for org list (member=pubkey)
 * @returns {Promise<{ token: string, email: string, name: string, label: string, createdAt: string, pubkey?: string }>}
 */
async function createApiToken(email, name, label, pubkey) {
  const bytes = new Uint8Array(32);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.getRandomValues
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const NodeCrypto = require('crypto');
    NodeCrypto.randomFillSync(bytes);
  }
  const token = Buffer.from(bytes).toString('base64url');
  const data = {
    email,
    name: name || email,
    label: label || 'CLI token',
    createdAt: new Date().toISOString(),
    ...(pubkey && typeof pubkey === 'string' && pubkey.trim()
      ? { pubkey: pubkey.trim() }
      : {}),
  };
  await kv.set(TOKEN_PREFIX + token, JSON.stringify(data));
  await kv.sAdd(USER_TOKENS_PREFIX + email, token);
  return { token, ...data };
}

/**
 * Verify an API token and return its data, or null if invalid.
 * @param {string} token
 * @returns {Promise<{ email: string, name: string, label: string, createdAt: string } | null>}
 */
async function verifyApiToken(token) {
  if (!token || typeof token !== 'string' || !token.trim()) return null;
  try {
    const raw = await kv.get(TOKEN_PREFIX + token.trim());
    if (!raw) return null;
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return null;
  }
}

/**
 * List all tokens for a user (token values masked to first 8 chars).
 * @param {string} email
 * @returns {Promise<Array<{ token: string, label: string, createdAt: string }>>}
 */
async function listApiTokens(email) {
  if (!email) return [];
  const tokens = await kv.sMembers(USER_TOKENS_PREFIX + email);
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const results = [];
  for (const t of tokens) {
    const raw = await kv.get(TOKEN_PREFIX + t);
    if (raw) {
      try {
        const data = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        results.push({
          token: `${t.slice(0, 8)}…`,
          tokenId: t.slice(0, 8),
          label: data.label,
          createdAt: data.createdAt,
        });
      } catch {
        // skip malformed
      }
    }
  }
  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Revoke a token by its full value.
 * @param {string} email
 * @param {string} token
 */
async function revokeApiToken(email, token) {
  if (!email || !token) return;
  await kv.del(TOKEN_PREFIX + token);
  await kv.sRem(USER_TOKENS_PREFIX + email, token);
}

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
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    },
    secret,
    { algorithm: 'HS256', expiresIn: maxAgeSeconds }
  );
}

/**
 * Verify session JWT and return payload or null.
 */
async function verifySessionToken(token, secret) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
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
  createApiToken,
  verifyApiToken,
  listApiTokens,
  revokeApiToken,
};
