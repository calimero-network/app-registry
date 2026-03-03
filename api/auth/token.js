/**
 * POST /api/auth/token — create a new API token (requires session cookie or Bearer token)
 */

const { resolveUser } = require('../lib/auth-helpers');
const { kv } = require('../lib/kv-client');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const user = await resolveUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Login required to create API tokens',
    });
  }

  const label =
    typeof req.body?.label === 'string'
      ? req.body.label.trim() || 'CLI token'
      : 'CLI token';

  const bytes = Buffer.alloc(32);
  require('crypto').randomFillSync(bytes);
  const token = bytes.toString('base64url');

  const data = {
    email: user.email,
    name: user.name || user.email,
    label,
    createdAt: new Date().toISOString(),
  };

  try {
    await kv.set(TOKEN_PREFIX + token, JSON.stringify(data));
    await kv.sAdd(USER_TOKENS_PREFIX + user.email, token);
    return res
      .status(201)
      .json({ token, label: data.label, createdAt: data.createdAt });
  } catch (e) {
    console.error('POST /api/auth/token error:', e);
    return res
      .status(500)
      .json({ error: 'internal', message: e?.message ?? String(e) });
  }
};
