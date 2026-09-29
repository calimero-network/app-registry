/**
 * Server-stamped package ownership (`metadata._ownerEmail`).
 *
 * `_ownerEmail` records the account that first published a package, and is
 * what lets that account manage it later (delete, yank, assets, org link). It
 * is set exactly once, on the first publish, and every later version copies it
 * from the versions already stored — never from whoever pushes the new
 * version. Publishing a new version is authorized by the signing key (or org
 * membership), which is a different question from which account manages the
 * package, so the pushing account must not change the recorded owner.
 *
 * Shared by the Vercel push routes (push.js, push-file.js) and the Fastify dev
 * server so all publish paths stamp ownership the same way.
 */

/**
 * The owner email recorded on an existing package, or null.
 *
 * Walks versions from the oldest to the newest and returns the first
 * `_ownerEmail` found. It deliberately does not fall back to `metadata.author`:
 * on older bundles `author` could come from the signed manifest itself, so it
 * is not a server-verified identity.
 *
 * @param {{ getBundleManifest: (pkg: string, version: string) => Promise<object|null> }} store
 * @param {string} pkg
 * @param {string[]} versions Existing versions, newest first (as returned by
 *   getBundleVersions).
 * @param {Record<string, object|null>} [known] Manifests the caller already
 *   loaded, keyed by version, to avoid re-reading them.
 * @returns {Promise<string|null>}
 */
async function findExistingOwnerEmail(store, pkg, versions, known = {}) {
  for (let i = versions.length - 1; i >= 0; i--) {
    const version = versions[i];
    const manifest = Object.prototype.hasOwnProperty.call(known, version)
      ? known[version]
      : await store.getBundleManifest(pkg, version);
    const email = manifest?.metadata?._ownerEmail;
    if (typeof email === 'string' && email) return email;
  }
  return null;
}

/**
 * Stamp `_ownerEmail` on a manifest about to be stored.
 *
 * - First publish (no existing versions): the publishing account.
 * - Later versions: inherited from the existing versions. When none of them
 *   records an owner (legacy data) it is left unset, so the package is managed
 *   by org and site admins rather than by whichever account pushed next.
 *
 * Any publisher-supplied `_ownerEmail` must already have been stripped
 * (stripReservedMetadata) before this runs.
 *
 * @returns {Promise<string|null>} The owner email that was stamped, or null.
 */
async function stampOwnerEmail({
  store,
  manifest,
  versions,
  publisherEmail,
  known,
}) {
  manifest.metadata = manifest.metadata || {};
  const owner =
    versions.length === 0
      ? publisherEmail || null
      : await findExistingOwnerEmail(store, manifest.package, versions, known);
  if (owner) {
    manifest.metadata._ownerEmail = owner;
  } else {
    delete manifest.metadata._ownerEmail;
  }
  return owner;
}

module.exports = { findExistingOwnerEmail, stampOwnerEmail };
