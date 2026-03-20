/**
 * POST /api/auth/username — claim a username (immutable once set)
 */

const { requireAuth } = require('../lib/auth-helpers');
const { claimUsername } = require('../lib/user-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const { username } = req.body || {};
  if (!username || typeof username !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'username is required' });
  }

  // userId: prefer sub from JWT, fall back to email as key
  const userId = user.id || user.email;

  try {
    const updated = await claimUsername(userId, username.trim());
    return res.status(200).json({ username: updated.username });
  } catch (err) {
    const code = err.code;
    if (code === 'invalid_format')
      return res
        .status(400)
        .json({ error: 'invalid_format', message: err.message });
    if (code === 'blocked')
      return res.status(400).json({ error: 'blocked', message: err.message });
    if (code === 'taken')
      return res.status(409).json({ error: 'taken', message: err.message });
    if (code === 'immutable')
      return res.status(409).json({ error: 'immutable', message: err.message });
    console.error('POST /api/auth/username failed:', err);
    return res
      .status(500)
      .json({ error: 'server_error', message: 'Failed to set username' });
  }
};
