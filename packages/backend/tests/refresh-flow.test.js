/**
 * The refresh decision, shared by both runtimes.
 *
 * This logic previously existed twice and the copies drifted to different
 * status codes for a suspended account, so the statuses are what these pin.
 */

const {
  refreshSession,
} = require('@calimero-network/registry-shared/refresh-flow');

const EMAIL = 'ronit@calimero.network';

function makeDeps({
  rotated = null,
  blacklisted = false,
  profile = null,
  held = undefined,
  onBlacklist = null,
} = {}) {
  const calls = { revokeAll: [], rotated: 0 };
  return {
    calls,
    deps: {
      refresh: {
        // Non-destructive read. Defaults to agreeing with `rotated` so the
        // common cases stay terse; `held` sets them apart for the race test.
        verify: async () =>
          held !== undefined
            ? held
            : rotated && { email: rotated.email, userId: rotated.userId },
        rotate: async () => {
          calls.rotated++;
          return rotated;
        },
        revokeAllForEmail: async e => {
          calls.revokeAll.push(e);
          return 1;
        },
      },
      isBlacklisted: async () => {
        if (onBlacklist) onBlacklist();
        return blacklisted;
      },
      getUserByEmail: async () => profile,
    },
  };
}

describe('refreshSession', () => {
  it('401s without clearing cookies when nothing was presented', async () => {
    const { deps } = makeDeps();
    const r = await refreshSession(deps, undefined);
    expect(r).toMatchObject({
      ok: false,
      status: 401,
      error: 'no_refresh_token',
      // A session cookie that may still be valid should not be disturbed.
      clearCookies: false,
    });
  });

  it('401s without clearing when the token is expired, unknown or spent', async () => {
    const { deps } = makeDeps({ rotated: null });
    const r = await refreshSession(deps, 'stale-token');
    expect(r).toMatchObject({
      ok: false,
      status: 401,
      error: 'invalid_refresh_token',
      // Must not clear: cookies are shared across tabs, so a tab that lost a
      // rotation race would wipe the credentials the winner just installed.
      clearCookies: false,
    });
  });

  it('does not spend the token when the blacklist check throws', async () => {
    const { deps, calls } = makeDeps({
      rotated: { token: 'new', email: EMAIL, userId: 'u1' },
      onBlacklist: () => {
        throw new Error('redis down');
      },
    });
    await expect(refreshSession(deps, 'good-token')).rejects.toThrow(
      'redis down'
    );
    // The client still holds a token that works, so a retry can succeed.
    expect(calls.rotated).toBe(0);
  });

  it('does not spend the token when the profile lookup throws', async () => {
    const { deps, calls } = makeDeps({
      rotated: { token: 'new', email: EMAIL, userId: 'u1' },
    });
    deps.getUserByEmail = async () => {
      throw new Error('redis down');
    };
    await expect(refreshSession(deps, 'good-token')).rejects.toThrow(
      'redis down'
    );
    expect(calls.rotated).toBe(0);
  });

  it('401s without clearing when rotation loses a concurrent race', async () => {
    // verify saw a live token, but another tab spent it first.
    const { deps } = makeDeps({
      held: { email: EMAIL, userId: 'u1' },
      profile: { id: 'u1' },
      rotated: null,
    });
    const r = await refreshSession(deps, 'raced-token');
    expect(r).toMatchObject({ status: 401, clearCookies: false });
  });

  it('403s for a suspended account and kills its other sessions', async () => {
    const { deps, calls } = makeDeps({
      rotated: { token: 'new', email: EMAIL, userId: 'u1' },
      blacklisted: true,
    });
    const r = await refreshSession(deps, 'good-token');
    // 403, not 401: "you are blocked" is not "log in again".
    expect(r).toMatchObject({
      ok: false,
      status: 403,
      error: 'account_suspended',
      clearCookies: true,
    });
    expect(calls.revokeAll).toEqual([EMAIL]);
  });

  it('returns the rotated token and claims on success', async () => {
    const { deps } = makeDeps({
      rotated: { token: 'next-token', email: EMAIL, userId: 'u1' },
      profile: { id: 'p1', name: 'Ronit Chawla', picture: 'pic' },
    });
    const r = await refreshSession(deps, 'good-token');
    expect(r).toEqual({
      ok: true,
      email: EMAIL,
      refreshToken: 'next-token',
      claims: {
        sub: 'u1',
        email: EMAIL,
        name: 'Ronit Chawla',
        picture: 'pic',
      },
    });
  });

  it('falls back to the profile id and the email as a name', async () => {
    const { deps } = makeDeps({
      rotated: { token: 'next', email: EMAIL, userId: null },
      profile: { id: 'p1' },
    });
    const r = await refreshSession(deps, 'good-token');
    expect(r.claims).toMatchObject({ sub: 'p1', name: EMAIL, picture: null });
  });

  it('refuses and revokes when the profile is gone', async () => {
    // Login always writes a profile, so its absence means the account was
    // deleted. Admin deletion does not blacklist, so this is the only thing
    // stopping a deleted user refreshing for the life of the token.
    const { deps, calls } = makeDeps({
      rotated: { token: 'next', email: EMAIL, userId: 'u1' },
      profile: null,
    });
    const r = await refreshSession(deps, 'good-token');
    expect(r).toMatchObject({
      ok: false,
      status: 401,
      error: 'account_gone',
      clearCookies: true,
    });
    expect(calls.revokeAll).toEqual([EMAIL]);
    expect(calls.rotated).toBe(0);
  });

  it('does not revoke anything for a healthy account', async () => {
    const { deps, calls } = makeDeps({
      rotated: { token: 'next', email: EMAIL, userId: 'u1' },
      profile: { id: 'u1' },
    });
    await refreshSession(deps, 'good-token');
    expect(calls.revokeAll).toEqual([]);
  });
});
