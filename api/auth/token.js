/**
 * POST /api/auth/token — create a new API token (session cookie required)
 *
 * Minting needs an interactive login: an API token cannot be used to create
 * further tokens, the same rule revoke follows. Bot accounts are refused here
 * as they are by requireAuth.
 */

const {
  resolveSessionUser,
  rejectUnauthenticated,
  BOT_FORBIDDEN,
} = require('#api-lib/auth-helpers');
const { isBot } = require('#api-lib/admin-storage');
const { apiTokens } = require('#api-lib/api-token-storage');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const user = await resolveSessionUser(req);
  if (!user) {
    return rejectUnauthenticated(req, res, {
      error: 'unauthorized',
      message: 'Session login required to create API tokens',
    });
  }
  if (await isBot(user.email)) {
    return res.status(403).json(BOT_FORBIDDEN);
  }

  const label =
    typeof req.body?.label === 'string'
      ? req.body.label.trim() || 'CLI token'
      : 'CLI token';

  try {
    // Stored hashed with a 90-day expiry; the raw token is only ever returned
    // here, once. See shared/api-token-storage.js.
    const created = await apiTokens.create(user.email, user.name, label);
    return res.status(201).json({
      token: created.token,
      tokenId: created.tokenId,
      label: created.label,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    });
  } catch (e) {
    console.error('POST /api/auth/token error:', e);
    return res
      .status(500)
      .json({ error: 'internal', message: 'Internal error' });
  }
};
