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
 * @returns {Promise<
 *   | {ok: true, email: string, refreshToken: string, claims: object}
 *   | {ok: false, status: number, error: string, message: string, clearCookies: boolean}
 * >}
 */
async function refreshSession(deps, presentedToken) {
  const { refresh, isBlacklisted, getUserByEmail } = deps;

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

  const rotated = await refresh.rotate(presentedToken);
  if (!rotated) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_refresh_token',
      message: 'Session expired',
      // Expired, unknown, or already spent: clear both so the client stops
      // retrying with a credential that will never work again.
      clearCookies: true,
    };
  }

  // Re-checked on every refresh rather than only at login, so suspending an
  // account ends its sessions within the session lifetime.
  if (await isBlacklisted(rotated.email)) {
    await refresh.revokeAllForEmail(rotated.email);
    return {
      ok: false,
      status: 403,
      error: 'account_suspended',
      message: 'This account has been suspended',
      clearCookies: true,
    };
  }

  const profile = await getUserByEmail(rotated.email);
  return {
    ok: true,
    email: rotated.email,
    refreshToken: rotated.token,
    claims: {
      sub: rotated.userId ?? profile?.id,
      email: rotated.email,
      name: profile?.name ?? rotated.email,
      picture: profile?.picture ?? null,
    },
  };
}

module.exports = { refreshSession };
