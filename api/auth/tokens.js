/**
 * GET /api/auth/tokens — list API tokens for current user (masked)
 */

const { resolveUser } = require('../lib/auth-helpers');
const { kv } = require('../lib/kv-client');

const TOKEN_PREFIX = 'apitoken:';
const USER_TOKENS_PREFIX = 'user_tokens:';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  const user = await resolveUser(req);
  if (!user) {
    return res
      .status(401)
      .json({ error: 'unauthorized', message: 'Login required' });
  }

  try {
    const allTokens = await kv.sMembers(USER_TOKENS_PREFIX + user.email);
    const tokens = [];
    if (Array.isArray(allTokens)) {
      for (const t of allTokens) {
        const raw = await kv.get(TOKEN_PREFIX + t);
        if (raw) {
          try {
            const data = JSON.parse(
              typeof raw === 'string' ? raw : String(raw)
            );
            tokens.push({
              token: `${t.slice(0, 8)}…`,
              tokenId: t.slice(0, 8),
              label: data.label,
              createdAt: data.createdAt,
            });
          } catch {
            /* skip malformed */
          }
        }
      }
    }
    tokens.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return res.status(200).json({ tokens });
  } catch (e) {
    console.error('GET /api/auth/tokens error:', e);
    return res
      .status(500)
      .json({ error: 'internal', message: e?.message ?? String(e) });
  }
};
