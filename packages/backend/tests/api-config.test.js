/**
 * Vercel Routing/Config Contract Tests
 *
 * vercel.json is as load-bearing as the handler code — it supplies CORS for the
 * whole API, decides which files become functions, and keeps the SPA catch-all
 * from swallowing /api. None of it was covered, and a mistake here breaks every
 * endpoint at once while every unit test stays green.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')
);

const apiHeaderRule = config.headers.find(h => h.source === '/api/(.*)');

function headerValue(rule, name) {
  const found = rule.headers.find(
    h => h.key.toLowerCase() === name.toLowerCase()
  );
  return found?.value;
}

describe('vercel.json function config', () => {
  test('every api/**/*.js file is deployed as a function', () => {
    expect(config.functions['api/**/*.js']).toBeDefined();
  });

  test('function timeout leaves room for slow upstreams', () => {
    expect(config.functions['api/**/*.js'].maxDuration).toBeGreaterThanOrEqual(
      10
    );
  });
});

describe('vercel.json CORS', () => {
  // Handlers rely on this block rather than setting CORS individually — see
  // api-handler-contract.test.js. Removing it silently breaks every browser
  // caller of the API while all handler tests keep passing.
  test('the /api/(.*) header rule exists', () => {
    expect(apiHeaderRule).toBeDefined();
  });

  test('it allows any origin, the verbs in use, and auth headers', () => {
    expect(headerValue(apiHeaderRule, 'Access-Control-Allow-Origin')).toBe('*');

    const methods = headerValue(apiHeaderRule, 'Access-Control-Allow-Methods');
    for (const verb of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(verb);
    }

    const headers = headerValue(apiHeaderRule, 'Access-Control-Allow-Headers');
    expect(headers).toContain('Content-Type');
    expect(headers).toContain('Authorization');
  });

  test('it does NOT blanket-cache the API', () => {
    // Caching is opt-in per handler (see api/v2/bundles/index.js). A
    // Cache-Control here would also cache /api/auth/me and the admin routes,
    // which would serve one user's session data to the next.
    expect(headerValue(apiHeaderRule, 'Cache-Control')).toBeUndefined();
  });
});

describe('vercel.json routing', () => {
  test('the SPA catch-all does not swallow /api or /artifacts', () => {
    const catchAll = config.rewrites.find(r => r.destination === '/index.html');
    expect(catchAll).toBeDefined();

    // The negative lookahead is what keeps API requests from being rewritten
    // to the SPA shell and returning HTML to JSON clients. Anchored, because
    // Vercel matches source patterns against the whole path.
    const spaRegex = new RegExp(`^${catchAll.source}$`);
    expect(spaRegex.test('/api/v2/bundles')).toBe(false);
    expect(spaRegex.test('/artifacts/pkg/1.0.0/app.wasm')).toBe(false);
    expect(spaRegex.test('/developers')).toBe(true);
  });

  test('artifact downloads route to the artifact handler', () => {
    const rule = config.rewrites.find(r => r.source.startsWith('/artifacts/'));
    expect(rule).toBeDefined();
    expect(rule.destination).toContain('/api/artifacts/');
  });
});

describe('security headers', () => {
  test('clickjacking and MIME-sniffing protections are set site-wide', () => {
    const siteRule = config.headers.find(h => h.source === '/(.*)');
    expect(headerValue(siteRule, 'X-Frame-Options')).toBe('DENY');
    expect(headerValue(siteRule, 'X-Content-Type-Options')).toBe('nosniff');
  });
});
