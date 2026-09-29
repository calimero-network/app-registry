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
 * Ownership check. Only the server-stamped `metadata._ownerEmail` (the email
 * of the authenticated account that published) confers ownership, compared
 * case-insensitively against the account email.
 *
 * `metadata.author` is a display field and is never consulted here: it lives
 * inside the publisher-signed manifest and, on older bundles, was stored as
 * the publisher supplied it, so it identifies no account. Packages without an
 * `_ownerEmail` are managed through their organization or by a site admin.
 */
function manifestOwnedByUser(manifest, user) {
  const ownerEmail = manifest?.metadata?._ownerEmail;
  const email = user?.email;
  if (typeof ownerEmail !== 'string' || typeof email !== 'string') return false;
  const a = ownerEmail.trim().toLowerCase();
  const b = email.trim().toLowerCase();
  return a !== '' && a === b;
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
   * True when the user published the package (server-stamped owner email),
   * administers the organization the package is linked to, or is a site admin.
   *
   * @param {string} packageName
   * @param {object} manifest The package manifest the caller is acting on.
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
  'Only the package owner, an admin or owner of the organization it belongs to, or a site admin can do this.';

module.exports = {
  manifestOwnedByUser,
  createPackagePermissions,
  NOT_OWNER_MESSAGE,
};
