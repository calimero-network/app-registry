/**
 * The dev server, on the things a browser actually does to it.
 *
 * Every case here was found by pointing a real browser at `pnpm dev` and
 * reading the console, and every one of them was invisible to the existing
 * suite: the unit tests call handlers directly, and the Playwright suite runs
 * against a STUBBED API, so neither ever exercises Fastify's routing, its
 * body parsers, or a redirect.
 */

const { buildServer } = require('../src/server');

let server;

beforeAll(async () => {
  server = await buildServer();
});

afterAll(async () => {
  await server?.close();
});

describe('routes that exist only as serverless handlers', () => {
  // ⚠️ THE TWO RUNTIMES HAD DRIFTED COMPLETELY. Production runs the handlers
  // under `api/`; dev hand-wrote its own routes and simply did not have these,
  // so a browser on localhost got `404 Route GET:/api/v2/packages/<pkg>/assets
  // not found` for every package on every page — and the frontend reports a
  // failed asset read as "no preview", so nothing looked broken.
  test('the asset listing is mounted', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v2/packages/com.example.nothing/assets',
    });
    // ⚠️ 404 IS NOT ENOUGH TO TELL THESE APART. The handler answers 404 for a
    // package that does not exist, and Fastify answers 404 for a route it does
    // not have — the status alone would have passed against the bug. The body
    // is what distinguishes them: Fastify's says `Route GET:… not found`.
    const body = JSON.parse(res.payload || '{}');
    expect(body.message || '').not.toMatch(/^Route /);
    expect(body.error).not.toBe('Not Found');
  });

  test('the composite package read is mounted', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v2/packages/com.example.nothing',
    });
    // 404 from the HANDLER (no such package) is fine; what must not happen is
    // Fastify answering "no such route".
    const body = JSON.parse(res.payload || '{}');
    expect(body.message || '').not.toMatch(/not found$/i);
    expect(body.error).not.toBe('Not Found');
  });

  test('the review queue is mounted and admin-only', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/review-queue',
    });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('POST /api/auth/refresh with no body', () => {
  // There is nothing to send — the credential is a cookie. Fastify refused
  // both shapes a browser produces, so a session could never refresh against
  // the dev server: every page load logged an error and every local session
  // expired at the access token's lifetime.
  test('accepts an empty form-encoded body rather than 415', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: '',
    });
    expect(res.statusCode).not.toBe(415);
    expect(JSON.parse(res.payload).error).toBe('no_refresh_token');
  });

  test('accepts an empty JSON body rather than 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.payload).error).toBe('no_refresh_token');
  });

  test('still rejects malformed JSON', async () => {
    // An absent body is not a malformed one, and loosening the first must not
    // loosen the second.
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/auth/google', () => {
  test('redirects to Google instead of failing', async () => {
    // ⚠️ Fastify 5 takes `reply.redirect(url, code)`; v4 took `(code, url)`.
    // All seven redirects in auth-routes.js used the old order, so the URL was
    // the number 302 and the call threw — sign-in answered 500, and the catch
    // logged "Auth redirect failed", which reads like a Google problem. No
    // test followed a redirect, so nothing caught it.
    const res = await server.inject({ method: 'GET', url: '/api/auth/google' });

    if (res.statusCode === 503) {
      // No GOOGLE_CLIENT_ID in this environment: the handler's own guard,
      // which is a different answer from a broken redirect.
      expect(JSON.parse(res.payload).error).toBe('auth_not_configured');
      return;
    }
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});

describe('the auth rate limiter', () => {
  test('answers 429, not 500', async () => {
    // ⚠️ `errorResponseBuilder` returning a body without `statusCode` makes
    // @fastify/rate-limit build an error carrying no status, and Fastify
    // defaults to 500 — so a throttled client was told the server had failed
    // (the frontend reports that as an outage rather than backing off) and a
    // real 500 became indistinguishable from a rate limit. The response
    // already carried `x-ratelimit-*` and `retry-after`, which is what made
    // it look right.
    let last;
    for (let i = 0; i < 25; i++) {
      last = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { 'x-forwarded-for': '203.0.113.42' },
      });
      if (last.statusCode === 429) break;
    }
    expect(last.statusCode).toBe(429);
    expect(JSON.parse(last.payload).error).toBe('too_many_requests');
  });
});
