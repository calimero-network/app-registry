/**
 * V2 Bundle Push API
 * POST /api/v2/bundles/push
 * Requires signature; verifies and enforces package ownership (same key as existing versions).
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  validateBundleMetadata,
  isValidPackageName,
  isValidPackageVersion,
  reservedPackagePrefix,
  isStaffEmail,
  PACKAGE_NAME_REGEX,
  CATEGORIES,
  stripReservedMetadata,
} = require('@calimero-network/registry-backend/src/lib/metadata-policy');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  isAllowedOwner,
  normalizeSignature,
} = require('#api-lib/verify');
const {
  storeRefusal,
} = require('@calimero-network/registry-backend/src/lib/bundle-integrity');
const {
  stampOwnerEmail,
} = require('@calimero-network/registry-backend/src/lib/package-owner');
const { resolveUser } = require('#api-lib/auth-helpers');
const { getUserByEmail } = require('#api-lib/user-storage');
const { isBot, isAdmin } = require('#api-lib/admin-storage');
const { LOGIN_REQUIRED } = require('#api-lib/auth-helpers');
const { getPkg2Org, setPkg2Org } = require('#api-lib/org-storage');
const {
  autolinkBotPackage,
} = require('@calimero-network/registry-shared/bot-autolink');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    // A publish needs an account (Bearer token for CLI/cargo-mero, session
    // cookie for web). The signature proves who BUILT the bundle, not who is
    // sending it — a public signed manifest can be replayed by anyone — so an
    // anonymous push is refused before anything else. Bots are accounts too
    // and may publish, hence resolveUser rather than requireAuth.
    const user = await resolveUser(req);
    if (!user?.email) {
      return res.status(401).json(LOGIN_REQUIRED);
    }

    const store = getStorage();
    const bundleManifest = req.body;

    if (
      !bundleManifest ||
      bundleManifest === null ||
      bundleManifest === undefined
    ) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing body',
      });
    }

    if (!bundleManifest?.package || !bundleManifest?.appVersion) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing required fields: package, appVersion',
      });
    }

    // Validate the package id and version shape before anything is stored. A
    // malformed id or a non-semver version otherwise reaches storage and breaks
    // ordering/lookup downstream.
    if (!isValidPackageName(bundleManifest.package)) {
      return res.status(400).json({
        error: 'invalid_package_name',
        message: `Package id must be lowercase reverse-DNS (e.g. com.example.app) matching ${PACKAGE_NAME_REGEX}.`,
      });
    }
    if (!isValidPackageVersion(bundleManifest.appVersion)) {
      return res.status(400).json({
        error: 'invalid_version',
        message: `appVersion must be a valid semver version (got "${bundleManifest.appVersion}").`,
      });
    }

    // Require signature for all publishes
    const sig = normalizeSignature(bundleManifest?.signature);
    if (!sig) {
      return res.status(400).json({
        error: 'missing_signature',
        message:
          'Missing signature. All publishes require a valid signature (algorithm, publicKey, signature).',
      });
    }

    try {
      await verifyManifest(bundleManifest);
    } catch (err) {
      // The verifier failing to run is a server fault, not a bad signature.
      if (err?.code === 'verifier_unavailable') throw err;
      return res.status(400).json({
        error: 'invalid_signature',
        message: err.message || 'Signature verification failed',
      });
    }

    const ownerEmail = user.email;
    const profile = await getUserByEmail(user.email);
    // Privacy: the public `author` is rendered on cards, the detail page and
    // /developers/<author>. Never fall back to the email here — a user with no
    // username publishes with no public author (null), while the email is kept
    // privately in `_ownerEmail` for ownership checks. `author` is optional in
    // the metadata policy, so a null author does not block the publish.
    const displayAuthor = profile?.username || null;

    // A deleted name/version is retired, not free: refuse a republish rather
    // than let it silently resurrect the old package's trust, assets and org
    // link (replay-resurrection / name re-registration).
    if (
      await store.isRetired(bundleManifest.package, bundleManifest.appVersion)
    ) {
      return res.status(409).json({
        error: 'name_retired',
        message:
          'This package name or version has been deleted and cannot be re-published.',
      });
    }

    // Ownership: same package must be published by the same key or by a key in owners[]
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await store.getBundleVersions(bundleManifest.package);
    bundleManifest.metadata = bundleManifest.metadata || {};

    // The manifest is signed, so any `metadata._*` the publisher put in
    // (_adminVerified, _ownerEmail) survived verification. Drop them before the
    // server stamps its own below — otherwise a publisher grants themselves the
    // verified badge and a trusted-publisher owner email.
    stripReservedMetadata(bundleManifest);

    // `metadata.author` is display-only and server-derived: it is stamped
    // below from the publishing account's username (or inherited from the
    // package's first version). Whatever the manifest carried is dropped so
    // the stored author always names a registry account.
    delete bundleManifest.metadata.author;

    // Reserve the Calimero package namespace for FIRST publishes only. The
    // prefix marks a first-party app and feeds the trusted-publisher shortcut,
    // so a stranger must not be able to CREATE a new `com.calimero.*` /
    // `network.calimero.*` package. Existing packages are governed by the owner
    // check below, so re-publishing a version is unaffected — every current
    // first-party package keeps releasing normally. The gate is on the
    // authenticated user (staff email, site admin, or a registry-managed bot),
    // never on a manifest field or the signing key.
    if (versions.length === 0) {
      const reservedPrefix = reservedPackagePrefix(bundleManifest.package);
      if (reservedPrefix) {
        const email = user?.email;
        const allowed =
          isStaffEmail(email) ||
          (!!email && (await isAdmin(email))) ||
          (!!email && (await isBot(email)));
        if (!allowed) {
          return res.status(403).json({
            error: 'reserved_prefix',
            message: `The "${reservedPrefix}" package namespace is reserved for Calimero.`,
          });
        }
      }
    }

    if (versions.length > 0) {
      const latestVersion = versions[0];
      const manifestLatest = await store.getBundleManifest(
        bundleManifest.package,
        latestVersion
      );
      if (!isAllowedOwner(manifestLatest, incomingKey)) {
        return res.status(403).json({
          error: 'not_owner',
          message:
            'Package name is already registered to a different key; you are not the owner.',
        });
      }
      // Author is locked from the oldest (first) version, not the latest
      const oldestVersion = versions[versions.length - 1];
      const manifestOldest = await store.getBundleManifest(
        bundleManifest.package,
        oldestVersion
      );
      const existingAuthor = manifestOldest?.metadata?.author;
      if (existingAuthor) {
        bundleManifest.metadata.author = existingAuthor;
      } else if (ownerEmail) {
        // Public author is the username only; the email is never promoted to
        // `author`.
        if (displayAuthor) bundleManifest.metadata.author = displayAuthor;
      }
      // Ownership (_ownerEmail) is inherited from the existing versions, never
      // taken from the account pushing this version.
      await stampOwnerEmail({
        store,
        manifest: bundleManifest,
        versions,
        publisherEmail: ownerEmail,
        known: {
          [latestVersion]: manifestLatest,
          [oldestVersion]: manifestOldest,
        },
      });
    } else if (ownerEmail) {
      // New package — public author is the username (or nothing when the user
      // has not set one); the email stays private in _ownerEmail.
      if (displayAuthor) bundleManifest.metadata.author = displayAuthor;
      bundleManifest.metadata._ownerEmail = ownerEmail;
    }

    // Never trust client-controlled _overwrite; only allow overwrite when server config enables it (e.g. migrations).
    // Metadata policy. THIS IS THE PRODUCTION PATH: Vercel serves these
    // functions, not packages/backend/src/server.js, so a check that exists
    // only in the Fastify server does not run for any real publish.
    const policy = validateBundleMetadata(bundleManifest, {
      isNewPackage: versions.length === 0,
    });
    if (policy.errors.length > 0) {
      return res.status(400).json({
        error: 'metadata_incomplete',
        message: `This bundle is missing metadata the registry requires of a new package:\n  - ${policy.errors.join('\n  - ')}`,
        problems: policy.errors,
        categories: CATEGORIES,
      });
    }

    // Server-stamped, never publisher-supplied. `_`-prefixed so
    // removeTransientFields drops them before signature verification.
    if (typeof bundleManifest._binary === 'string') {
      bundleManifest._installSize = Math.floor(
        bundleManifest._binary.length / 2
      );
    }
    bundleManifest._publishedAt = new Date().toISOString();

    const overwrite =
      process.env.ALLOW_BUNDLE_OVERWRITE === 'true' ||
      process.env.ALLOW_BUNDLE_OVERWRITE === '1';

    await store.storeBundleManifest(bundleManifest, overwrite);

    await autolinkBotPackage(
      { isBot, getUserByEmail, getPkg2Org, setPkg2Org },
      ownerEmail,
      bundleManifest.package
    );

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
      installSize: bundleManifest._installSize,
      ...(policy.warnings.length ? { warnings: policy.warnings } : {}),
    });
  } catch (error) {
    const refused = storeRefusal(error);
    if (refused) return res.status(refused.status).json(refused.body);
    console.error('Push Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
};
