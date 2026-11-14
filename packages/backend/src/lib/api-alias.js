'use strict';

/**
 * The registry API is unversioned: `/api/bundles`, `/api/orgs`, … are the
 * canonical paths. `/api/v2/...` is a deprecated alias of the same surface,
 * kept because released clients still call it — `meroctl` pushes to
 * `/api/v2/bundles/push`, the desktop app reads `/api/v2/bundles`,
 * `/api/v2/orgs`, `/api/v2/downloads/record` and the asset `raw` URLs, and
 * mdma's registry sync reads `/api/v2/bundles?fresh=1`. Those must keep
 * working for as long as such clients are in the field.
 *
 * ⚠️ THE HANDLERS STILL LIVE UNDER `v2`, IN BOTH RUNTIMES. Production serves
 * `api/v2/**` as Vercel functions, and Vercel resolves a request that names a
 * function file before it consults any rewrite. Leaving the files where they
 * are means the paths deployed clients call keep resolving exactly as before,
 * with no rewrite in their way; the unversioned paths are the ones that go
 * through a rewrite (`vercel.json`), onto the same functions. The Fastify
 * server mirrors that shape with `rewriteUrl` below, so both runtimes answer
 * both spellings from one implementation.
 *
 * ⚠️ A NEW TOP-LEVEL NAMESPACE UNDER `api/v2/` MUST BE ADDED HERE AND TO THE
 * TWO `vercel.json` REWRITES. `tests/api-unversioned-alias.test.js` fails
 * until all three agree with the directories under `api/v2/`.
 */

/** Top-level segments of the API that are served from `api/v2/`. */
const UNVERSIONED_NAMESPACES = Object.freeze([
  'bundles',
  'downloads',
  'invitations',
  'orgs',
  'packages',
]);

const UNVERSIONED_PATH = new RegExp(
  `^/api/(${UNVERSIONED_NAMESPACES.join('|')})(?=[/?#]|$)`
);

const VERSIONED_PATH = /^\/api\/v2(?=[/?#]|$)/;

/**
 * `Deprecation` header (RFC 9745) sent on every answer to an `/api/v2/...`
 * request: a structured-field date, the day the unversioned paths became
 * canonical (2026-11-13T00:00:00Z).
 */
const DEPRECATION_HEADER = '@1794528000';

/**
 * Map a request URL onto the route that serves it: `/api/<ns>/...` becomes
 * `/api/v2/<ns>/...`; every other URL (including `/api/v2/...` itself) is
 * returned unchanged.
 */
function toServingUrl(url) {
  return String(url).replace(UNVERSIONED_PATH, '/api/v2/$1');
}

/** True when the client called the deprecated `/api/v2/...` spelling. */
function isDeprecatedPath(url) {
  return VERSIONED_PATH.test(String(url));
}

module.exports = {
  UNVERSIONED_NAMESPACES,
  DEPRECATION_HEADER,
  toServingUrl,
  isDeprecatedPath,
};
