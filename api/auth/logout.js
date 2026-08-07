/**
 * POST /api/auth/logout — clear session cookie and revoke the refresh token
 */

const { refresh } = require('../lib/refresh-storage');
const {
  refreshCookieName,
  clearedSessionCookie,
  clearedRefreshCookie,
} = require('../../shared/session-cookies');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const raw = req.headers?.cookie || '';
  const name = refreshCookieName();
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    // Clearing the cookie alone would leave a token that still works if it was
    // captured, so retire it server-side too.
    try {
      await refresh.revoke(decodeURIComponent(part.slice(i + 1).trim()));
    } catch {
      /* logout still succeeds */
    }
    break;
  }

  res.setHeader('Set-Cookie', [clearedSessionCookie(), clearedRefreshCookie()]);
  return res.status(204).end();
};
