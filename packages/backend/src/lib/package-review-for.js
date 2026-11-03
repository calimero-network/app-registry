'use strict';

/**
 * A review module bound to a given kv.
 *
 * ⚠️ THE SANITISER IS CONSTRUCTED WITH A BARE `kv` IN FOUR PLACES — two
 * serverless routes, the Fastify server and the listing builder — and the
 * tests hand it an in-memory double. Importing the singleton from
 * `package-review.js` would bind the real Redis client inside a test that
 * thought it had isolated itself, and the failure would look like a flaky
 * assertion rather than a crossed wire. So the review logic is rebuilt around
 * whichever store the caller is using.
 */
const {
  createPackageReview,
} = require('@calimero-network/registry-shared/package-review');

const cache = new WeakMap();

module.exports = function packageReviewFor(kv) {
  if (cache.has(kv)) return cache.get(kv);

  async function publisherOf(pkg) {
    // Independent lookups, issued together so they share round trips.
    const emailOf = async () => {
      try {
        const versions = await kv.sMembers(`bundle-versions:${pkg}`);
        if (!versions?.length) return '';
        const raw = await kv.get(`bundle:${pkg}/${versions[0]}`);
        return (raw && JSON.parse(raw)?.json?.metadata?._ownerEmail) || '';
      } catch {
        return ''; /* any failure means "not trusted" — the default is deny */
      }
    };

    const orgSlugOf = async () => {
      try {
        const orgId = await kv.get(`pkg2org:${pkg}`);
        if (!orgId) return '';
        const raw = await kv.get(`org:${orgId}`);
        return (raw && JSON.parse(raw)?.slug) || orgId;
      } catch {
        return ''; /* same */
      }
    };

    const [email, orgSlug] = await Promise.all([emailOf(), orgSlugOf()]);
    return { email, orgSlug };
  }

  const instance = createPackageReview(kv, { publisherOf });
  cache.set(kv, instance);
  return instance;
};
