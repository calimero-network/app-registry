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
const { resolveUser } = require('#api-lib/auth-helpers');
const { getUserByEmail } = require('#api-lib/user-storage');
const { isBot } = require('#api-lib/admin-storage');
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
      return res.status(400).json({
        error: 'invalid_signature',
        message: err.message || 'Signature verification failed',
      });
    }

    const ownerEmail = user.email;
    const profile = await getUserByEmail(user.email);
    const displayAuthor = profile?.username || user.email;

    // Ownership: same package must be published by the same key or by a key in owners[]
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await store.getBundleVersions(bundleManifest.package);
    bundleManifest.metadata = bundleManifest.metadata || {};

    // The manifest is signed, so any `metadata._*` the publisher put in
    // (_adminVerified, _ownerEmail) survived verification. Drop them before the
    // server stamps its own below — otherwise a publisher grants themselves the
    // verified badge and a trusted-publisher owner email.
    stripReservedMetadata(bundleManifest);

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
        bundleManifest.metadata._ownerEmail =
          manifestOldest?.metadata?._ownerEmail || existingAuthor;
      } else if (displayAuthor) {
        bundleManifest.metadata.author = displayAuthor;
        bundleManifest.metadata._ownerEmail = ownerEmail;
      }
    } else if (displayAuthor) {
      // New package — use username as public author, store email privately
      bundleManifest.metadata.author = displayAuthor;
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
      message: error?.message ?? String(error),
    });
  }
};
