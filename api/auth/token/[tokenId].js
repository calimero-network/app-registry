/**
 * DELETE /api/auth/token/:tokenId — revoke an API token (session cookie required)
 */

const jwt = require('jsonwebtoken');
const { kv } = require('../../lib/kv-client');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      result[k] = decodeURIComponent(v);
    } catch {
      result[k] = v;
    }
  }
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' });

  // Revoke requires a session cookie (not just a Bearer token) for security
  const cookieName = process.env.AUTH_COOKIE_NAME || 'app_registry_session';
  const sessionSecret = process.env.SESSION_SECRET;
  const cookies = parseCookies(req);
  const sessionToken = cookies[cookieName];

  let sessionUser = null;
  if (sessionSecret && sessionToken) {
    try {
      const payload = jwt.verify(sessionToken, sessionSecret, {
        algorithms: ['HS256'],
      });
      if (payload?.email) sessionUser = { email: payload.email };
    } catch {
      /* invalid session */
    }
  }

  if (!sessionUser) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Session login required to revoke tokens',
    });
  }

  const tokenId = req.query?.tokenId;
  if (!tokenId || typeof tokenId !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'tokenId required' });
  }

  try {
    const allTokens = await kv.sMembers(USER_TOKENS_PREFIX + sessionUser.email);
    const match = Array.isArray(allTokens)
      ? allTokens.find(t => t.startsWith(tokenId))
      : null;
    if (!match) {
      return res
        .status(404)
        .json({ error: 'not_found', message: 'Token not found' });
    }
    await kv.del(TOKEN_PREFIX + match);
    await kv.sRem(USER_TOKENS_PREFIX + sessionUser.email, match);
    return res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/auth/token/:tokenId error:', e);
    return res
      .status(500)
      .json({ error: 'internal', message: e?.message ?? String(e) });
  }
};
