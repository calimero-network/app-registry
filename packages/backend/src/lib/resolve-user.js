const { verifySessionToken, verifyApiToken } = require('./auth');

/**
 * Resolve current user from session cookie or Bearer API token.
 * Session users keep Google profile fields; API token users get picture: null.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {{ cookieName: string; sessionSecret: string }} options
 * @returns {Promise<{ id: string; email: string; name?: string; picture?: string | null } | null>}
 */
async function resolveUser(request, { cookieName, sessionSecret }) {
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
