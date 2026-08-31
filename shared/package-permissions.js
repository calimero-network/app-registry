/**
 * Who may administer an already-published package (delete, yank).
 *
 * Publishing has always honoured organizations — isAllowedToPublish() falls back
 * to org membership when the signing key does not match — but delete and yank
 * only ever compared the manifest author, so an organization owner could not
 * remove a package their own org had published. These helpers close that gap,
 * and are shared by the Vercel serverless API and the Fastify backend so the
 * hosted and self-hosted registries answer identically.
 */

/**
 * Author check. The manifest records the publisher as a username in
 * metadata.author with metadata._ownerEmail alongside it; legacy bundles put
 * the email in metadata.author instead.
 */
function manifestOwnedByUser(manifest, user) {
  const author = manifest?.metadata?.author;
  const ownerEmail = manifest?.metadata?._ownerEmail;

  if (user?.username && author === user.username) return true;
  if (user?.email && ownerEmail === user.email) return true;
  if (user?.email && !user?.username && author === user.email) return true;
  return false;
}

/**
 * @param {object} deps
 * @param {(packageName: string) => Promise<string | null>} deps.getPkg2Org
 * @param {(orgId: string, email: string) => Promise<boolean>} deps.isOrgManager
 *   True for an org admin OR owner. Named for the role rather than after either
 *   org-storage module: api/lib/org-storage's isOrgAdmin already covers owners,
 *   the backend's isOrgAdmin is admin-only and isOrgAdminOrOwner is the match.
 * @param {(email: string) => Promise<boolean>} deps.isAdmin Site admin.
 */
function createPackagePermissions({ getPkg2Org, isOrgManager, isAdmin }) {
  /**
   * True when the user authored the package, administers the organization the
   * package is linked to, or is a site admin.
   *
   * @param {string} packageName
   * @param {object} manifest Any version's manifest; author is stable per package.
   * @param {{ email?: string, username?: string | null }} user
   */
  async function canManagePackage(packageName, manifest, user) {
    if (manifestOwnedByUser(manifest, user)) return true;
    if (!user?.email) return false;

    if (packageName) {
      const orgId = await getPkg2Org(packageName);
      if (orgId && (await isOrgManager(orgId, user.email))) return true;
    }

    return !!(await isAdmin(user.email));
  }

  return { canManagePackage };
}

const NOT_OWNER_MESSAGE =
  'Only the package author, an admin or owner of the organization it belongs to, or a site admin can do this.';

module.exports = {
  manifestOwnedByUser,
  createPackagePermissions,
  NOT_OWNER_MESSAGE,
};
