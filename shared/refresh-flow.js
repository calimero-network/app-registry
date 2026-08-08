/**
 * The decision half of POST /api/auth/refresh.
 * Used by both the Vercel serverless API and Fastify backend.
 *
 * Only cookie writing and token signing differ between the runtimes, so those
 * stay with each caller and everything else - including the status codes - is
 * decided here. An earlier revision duplicated this and the two copies drifted
 * to different statuses for a suspended account.
 */

/**
 * @param {{signSession: (claims: object) => Promise<string>}} deps signSession
 *   is passed in because the two runtimes sign differently, and because doing
 *   it here keeps every fallible step ahead of the rotation.
 * @returns {Promise<
 *   | {ok: true, email: string, sessionToken: string, refreshToken: string}
 *   | {ok: false, status: number, error: string, message: string, clearCookies: boolean}
 * >}
 */
async function refreshSession(deps, presentedToken) {
  const { refresh, isBlacklisted, getUserByEmail, signSession } = deps;

  if (!presentedToken) {
    return {
      ok: false,
      status: 401,
      error: 'no_refresh_token',
      message: 'No refresh token',
      // Nothing was presented, so there is nothing to clear and no reason to
      // disturb a session cookie that may still be valid.
      clearCookies: false,
    };
  }

  // Everything that can fail happens before the token is spent. Rotating first
  // and then throwing in isBlacklisted or getUserByEmail would leave the client
  // holding a token this call had already deleted, turning a transient fault
  // into a full re-login. verify does not consume, so it is safe to read here.
  const held = await refresh.verify(presentedToken);
  if (!held) return invalidRefresh();

  // Re-checked on every refresh rather than only at login, so suspending an
  // account ends its sessions within the session lifetime.
  if (await isBlacklisted(held.email)) {
    await refresh.revokeAllForEmail(held.email);
    return {
      ok: false,
      status: 403,
      error: 'account_suspended',
      message: 'This account has been suspended',
      // Definitive, unlike an unusable token: take the session down with it.
      clearCookies: true,
    };
  }

  const profile = await getUserByEmail(held.email);
  // Login always writes a profile, so its absence means the account was
  // deleted. Blacklisting is not the only way an account ends, and without
  // this a deleted user keeps refreshing for the life of the refresh token.
  if (!profile) {
    await refresh.revokeAllForEmail(held.email);
    return {
      ok: false,
      status: 401,
      error: 'account_gone',
      message: 'Session expired',
      clearCookies: true,
    };
  }

  const claims = {
    sub: held.userId ?? profile.id,
    email: held.email,
    name: profile.name ?? held.email,
    picture: profile.picture ?? null,
  };

  // Signed before the token is spent, for the same reason the reads are: a
  // failure here would otherwise discard the replacement while the presented
  // token was already gone, and the client would be holding a dead cookie.
  const sessionToken = await signSession(claims);

  // Spend it last. Losing this race means another tab rotated first, and its
  // reply already carries the replacement cookies. `held` is handed back so
  // this does not re-read a record it already has; the DEL inside is what
  // decides the winner, not the read.
  const rotated = await refresh.rotate(presentedToken, undefined, held);
  if (!rotated) return invalidRefresh();

  return {
    ok: true,
    email: held.email,
    sessionToken,
    refreshToken: rotated.token,
  };
}

function invalidRefresh() {
  return {
    ok: false,
    status: 401,
    error: 'invalid_refresh_token',
    message: 'Session expired',
    // Deliberately does not clear. Cookies are shared across tabs, so a tab
    // that lost a rotation race would otherwise wipe the credentials the
    // winning tab just installed and sign both of them out.
    clearCookies: false,
  };
}

module.exports = { refreshSession };
