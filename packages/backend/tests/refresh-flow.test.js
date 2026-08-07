/**
 * The refresh decision, shared by both runtimes.
 *
 * This logic previously existed twice and the copies drifted to different
 * status codes for a suspended account, so the statuses are what these pin.
 */

const { refreshSession } = require('../../../shared/refresh-flow');

const EMAIL = 'ronit@calimero.network';

function makeDeps({
  rotated = null,
  blacklisted = false,
  profile = null,
} = {}) {
  const calls = { revokeAll: [] };
  return {
    calls,
    deps: {
      refresh: {
        rotate: async () => rotated,
        revokeAllForEmail: async e => {
          calls.revokeAll.push(e);
          return 1;
        },
      },
      isBlacklisted: async () => blacklisted,
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

  it('401s and clears when the token is expired, unknown or spent', async () => {
    const { deps } = makeDeps({ rotated: null });
    const r = await refreshSession(deps, 'stale-token');
    expect(r).toMatchObject({
      ok: false,
      status: 401,
      error: 'invalid_refresh_token',
      clearCookies: true,
    });
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

  it('still succeeds when no profile exists', async () => {
    const { deps } = makeDeps({
      rotated: { token: 'next', email: EMAIL, userId: 'u1' },
      profile: null,
    });
    const r = await refreshSession(deps, 'good-token');
    expect(r.ok).toBe(true);
    expect(r.claims).toMatchObject({ sub: 'u1', name: EMAIL });
  });

  it('does not revoke anything for a healthy account', async () => {
    const { deps, calls } = makeDeps({
      rotated: { token: 'next', email: EMAIL, userId: 'u1' },
    });
    await refreshSession(deps, 'good-token');
    expect(calls.revokeAll).toEqual([]);
  });
});
