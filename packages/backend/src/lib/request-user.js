const { verifySessionToken, verifyApiToken } = require('./auth');

/**
 * Resolve current user from session cookie or Bearer token.
 * Returns null if unauthenticated.
 */
async function resolveUser(request, cookieName, sessionSecret) {
  const token = request.cookies?.[cookieName];
  const sessionUser = await verifySessionToken(token, sessionSecret);
  if (sessionUser?.email) return sessionUser;

  const auth = request.headers?.['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const tokenData = await verifyApiToken(auth.slice(7));
    if (tokenData?.email) {
      return {
        id: tokenData.email,
        email: tokenData.email,
        name: tokenData.name,
        picture: null,
      };
    }
  }

  return null;
}

module.exports = { resolveUser };
