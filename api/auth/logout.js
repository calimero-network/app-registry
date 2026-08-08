/**
 * POST /api/auth/logout — clear session cookie and revoke the refresh token
 */

const { refresh } = require('#api-lib/refresh-storage');
const {
  parseCookies,
  refreshCookieName,
  clearedSessionCookie,
  clearedRefreshCookie,
} = require('@calimero-network/registry-shared/session-cookies');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const presented = parseCookies(req.headers?.cookie)[refreshCookieName()];
  if (presented) {
    // Clearing the cookie alone would leave a token that still works if it was
    // captured, so retire it server-side too. Logout still succeeds if that
    // fails, but it is logged: the session survives server-side while the user
    // believes it ended, and nothing else would surface that.
    try {
      await refresh.revoke(presented);
    } catch (err) {
      console.error('POST /api/auth/logout: refresh revoke failed:', err);
    }
  }

  res.setHeader('Set-Cookie', [clearedSessionCookie(), clearedRefreshCookie()]);
  return res.status(204).end();
};
