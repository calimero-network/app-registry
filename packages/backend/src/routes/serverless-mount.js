'use strict';

/**
 * Mount the serverless handlers in `api/` on the Fastify dev server.
 *
 * ⚠️ THE TWO RUNTIMES HAD DRIFTED, SILENTLY AND COMPLETELY. Production runs
 * the handlers under `api/` as Vercel functions; local dev runs
 * `src/server.js`, which hand-writes each route. Every endpoint added to
 * `api/` since that split simply did not exist locally — the asset endpoints
 * shipped months ago, and a browser pointed at the dev server answered
 * `404 Route GET:/api/v2/packages/<pkg>/assets not found` for every package
 * on every page. Nothing failed loudly enough to notice: the frontend treats
 * a failed asset read as "no preview".
 *
 * Hand-porting them again would reproduce the drift. This adapts the handlers
 * themselves, so there is one implementation and the dev server cannot fall
 * behind it.
 *
 * ⚠️ THE ADAPTER IS NOT A GENERAL VERCEL SHIM. It covers exactly the surface
 * these handlers use — `req.method/query/body/headers/cookies` and
 * `res.status().json()/.send()/.end()/.setHeader()`. Anything reaching for
 * `res.write`, streaming, or `req.rawBody` needs this widened rather than
 * assumed to work.
 */

/** Wrap one serverless handler as a Fastify handler. */
function adapt(handler) {
  return async (request, reply) => {
    let sent = false;
    const res = {
      status(code) {
        reply.code(code);
        return this;
      },
      json(payload) {
        sent = true;
        reply.send(payload);
        return this;
      },
      send(payload) {
        sent = true;
        reply.send(payload);
        return this;
      },
      end(payload) {
        sent = true;
        // `.end()` with nothing must still close the response, and Fastify
        // treats `undefined` as "no payload yet" rather than as an empty body.
        reply.send(payload === undefined ? '' : payload);
        return this;
      },
      setHeader(key, value) {
        reply.header(key, value);
        return this;
      },
    };

    const req = {
      method: request.method,
      // Route params and query string in one bag: that is where a Vercel
      // handler reads both from (`req.query.package` is the `[package]`
      // segment).
      query: { ...(request.query || {}), ...(request.params || {}) },
      body: request.body,
      headers: request.headers,
      cookies: request.cookies || {},
      url: request.url,
    };

    await handler(req, res);
    if (!sent) reply.send('');
  };
}

const ROUTES = [
  // Assets — the endpoints that were missing entirely.
  [
    'get',
    '/api/v2/packages/:package/assets',
    '../../../../api/v2/packages/[package]/assets/index',
  ],
  [
    'post',
    '/api/v2/packages/:package/assets',
    '../../../../api/v2/packages/[package]/assets/index',
  ],
  [
    'patch',
    '/api/v2/packages/:package/assets',
    '../../../../api/v2/packages/[package]/assets/index',
  ],
  [
    'get',
    '/api/v2/packages/:package/assets/:assetId',
    '../../../../api/v2/packages/[package]/assets/[assetId]/index',
  ],
  [
    'delete',
    '/api/v2/packages/:package/assets/:assetId',
    '../../../../api/v2/packages/[package]/assets/[assetId]/index',
  ],
  [
    'get',
    '/api/v2/packages/:package/assets/:assetId/raw',
    '../../../../api/v2/packages/[package]/assets/[assetId]/raw',
  ],

  // The composite read, and the moderation queue.
  [
    'get',
    '/api/v2/packages/:package',
    '../../../../api/v2/packages/[package]/index',
  ],
  ['get', '/api/admin/review-queue', '../../../../api/admin/review-queue'],
];

module.exports = async function serverlessMount(server) {
  for (const [method, path, modulePath] of ROUTES) {
    const handler = require(modulePath);
    server[method](path, adapt(handler));
  }
  // Preflight for the asset paths, which the browser sends before an upload.
  server.options('/api/v2/packages/:package/assets', async (_req, reply) =>
    reply.code(200).send()
  );
};

module.exports.adapt = adapt;
module.exports.ROUTES = ROUTES;
