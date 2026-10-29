const { kv } = require('#api-lib/kv-client');
const {
  createPackageReview,
} = require('@calimero-network/registry-shared/package-review');
const { getPkg2Org, getOrg } = require('#api-lib/org-storage');

/**
 * Who published a package, for the trusted-publisher shortcut.
 *
 * ⚠️ READ FROM THE NEWEST MANIFEST AND THE ORG LINK, NOT FROM THE SESSION.
 * The question is who owns the package, not who is asking — a stranger
 * browsing a calimero-network app must see the same answer the owner does, or
 * the listing shows different apps to different people.
 *
 * ⚠️ ANY FAILURE HERE MEANS "NOT TRUSTED". A missing manifest, a broken JSON
 * parse or a dead org lookup must never fall through to approved: the whole
 * point of the gate is that the default is deny.
 */
async function publisherOf(pkg) {
  // The two lookups are independent, so they share round trips instead of
  // queueing behind each other: the listing waits on this for every package.
  const emailOf = async () => {
    try {
      const versions = await kv.sMembers(`bundle-versions:${pkg}`);
      if (!versions?.length) return '';
      // Any version will do: the author is stable per package.
      const raw = await kv.get(`bundle:${pkg}/${versions[0]}`);
      if (!raw) return '';
      const meta = JSON.parse(raw)?.json?.metadata || {};
      return meta._ownerEmail || '';
    } catch {
      return ''; /* not trusted */
    }
  };

  const orgSlugOf = async () => {
    try {
      const orgId = await getPkg2Org(pkg);
      if (!orgId) return '';
      const org = await getOrg(orgId);
      return org?.slug || orgId || '';
    } catch {
      return ''; /* not trusted */
    }
  };

  const [email, orgSlug] = await Promise.all([emailOf(), orgSlugOf()]);
  return { email, orgSlug };
}

module.exports = createPackageReview(kv, { publisherOf });
