/**
 * Session and refresh cookie shapes.
 *
 * The refresh cookie's Path is load-bearing and easy to get wrong by eye: RFC
 * 6265 sends a cookie only to its own path or a subpath, so scoping it to
 * /api/auth/refresh silently stops /api/auth/logout from ever seeing the token
 * it is meant to revoke. These assert the path rule directly rather than
 * trusting a reading of it.
 */

const {
  REFRESH_COOKIE_PATH,
  sessionCookie,
  refreshCookie,
  clearedSessionCookie,
  clearedRefreshCookie,
  SESSION_MAX_AGE,
  REFRESH_MAX_AGE,
  sessionCookieOptions,
  refreshCookieOptions,
} = require('../../../shared/session-cookies');

/** RFC 6265 section 5.1.4 path-match. */
function pathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  if (cookiePath.endsWith('/')) return true;
  return requestPath[cookiePath.length] === '/';
}

describe('refresh cookie path', () => {
  it('reaches every endpoint that needs the token', () => {
    for (const p of ['/api/auth/refresh', '/api/auth/logout']) {
      expect(pathMatches(p, REFRESH_COOKIE_PATH)).toBe(true);
    }
  });

  it('is not attached to ordinary API traffic', () => {
    for (const p of [
      '/api/v2/bundles',
      '/api/v2/orgs/x/members',
      '/api/stats',
    ]) {
      expect(pathMatches(p, REFRESH_COOKIE_PATH)).toBe(false);
    }
  });

  it('would not have reached logout under the narrower path', () => {
    // Guards the regression directly: this is the shape that broke revocation.
    expect(pathMatches('/api/auth/logout', '/api/auth/refresh')).toBe(false);
  });

  it('covers the rest of /api/auth too, which is the accepted trade', () => {
    // Pinned so the real reach and the documented reach cannot drift: these
    // carry the token as a side effect of keeping logout reachable.
    for (const p of [
      '/api/auth/me',
      '/api/auth/token',
      '/api/auth/tokens',
      '/api/auth/username',
      '/api/auth/google',
      '/api/auth/google/callback',
    ]) {
      expect(pathMatches(p, REFRESH_COOKIE_PATH)).toBe(true);
    }
  });
});

describe('cookie attributes', () => {
  it('sets the hardening flags on both cookies', () => {
    for (const c of [sessionCookie('t'), refreshCookie('t')]) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Secure');
      expect(c).toContain('SameSite=Lax');
    }
  });

  it('scopes the session cookie site-wide and the refresh cookie to auth', () => {
    expect(sessionCookie('t')).toContain('Path=/;');
    expect(refreshCookie('t')).toContain(`Path=${REFRESH_COOKIE_PATH};`);
  });

  it('clearing uses Max-Age=0 on the same path, so the browser drops it', () => {
    expect(clearedSessionCookie()).toContain('Max-Age=0');
    expect(clearedRefreshCookie()).toContain('Max-Age=0');
    expect(clearedRefreshCookie()).toContain(`Path=${REFRESH_COOKIE_PATH};`);
  });

  it('keeps the session shorter than the refresh window', () => {
    expect(SESSION_MAX_AGE).toBeLessThan(REFRESH_MAX_AGE);
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 12);
    expect(REFRESH_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});

describe('fastify cookie options', () => {
  it('carry the same attributes as the header form', () => {
    // Login, refresh and logout all build cookies from these, so the two
    // shapes agreeing is what stops a flag being added to one and not the
    // other.
    const s = sessionCookieOptions({ secure: true });
    expect(s).toEqual({
      path: '/',
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      sameSite: 'lax',
      secure: true,
    });

    const r = refreshCookieOptions({ secure: true });
    expect(r).toEqual({
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      maxAge: REFRESH_MAX_AGE,
      sameSite: 'lax',
      secure: true,
    });
  });

  it('take an overridden session lifetime and a non-https secure flag', () => {
    expect(sessionCookieOptions({ maxAge: 60, secure: false })).toMatchObject({
      maxAge: 60,
      secure: false,
    });
  });
});
