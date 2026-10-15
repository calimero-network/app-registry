/**
 * Package claims: an Ed25519 signature by a package key naming the account
 * that may manage the package, so that pushing a copied bundle grants nothing.
 */

const crypto = require('crypto');
const canonicalize = require('canonicalize');
const { isAllowedOwner, verifySignature } = require('./verify');
const { isDevSigningKey } = require('./dev-signing-key');
const { reservedPackagePrefix } = require('./metadata-policy');

const CLAIM_DOMAIN = Buffer.from('calimero.registry.package-claim.v1\0');
const CLAIM_MAX_AGE_MS = 10 * 60 * 1000; // bounds reuse of a claim the key holder has since replaced
const CLAIM_MAX_SKEW_MS = 60 * 1000; // tolerated clock drift for a claim dated in the future
const CLAIM_WRITE_ATTEMPTS = 3; // re-applies the claim if a concurrent write restored the old manager

/** SHA-256 of the domain tag and the RFC 8785 form of the claimed fields. */
function claimPayload({ packageName, account, issuedAt, registry }) {
  return crypto
    .createHash('sha256')
    .update(CLAIM_DOMAIN)
    .update(canonicalize({ account, issuedAt, package: packageName, registry }))
    .digest();
}

/**
 * Why `claim` does not let `account` manage `packageName` on `registry` (an
 * origin), or null. The caller checks that `claim.publicKey` is a package key.
 */
async function claimRefusal(
  claim,
  { packageName, account, registry, now = Date.now() }
) {
  if (
    !claim ||
    typeof claim !== 'object' ||
    typeof claim.publicKey !== 'string' ||
    typeof claim.signature !== 'string' ||
    typeof claim.issuedAt !== 'string'
  ) {
    return 'claim must carry publicKey, signature and issuedAt';
  }
  if (isDevSigningKey(claim.publicKey)) {
    return 'the shared development key cannot claim a package';
  }
  const issued = Date.parse(claim.issuedAt);
  if (
    !Number.isFinite(issued) ||
    now - issued > CLAIM_MAX_AGE_MS ||
    issued - now > CLAIM_MAX_SKEW_MS
  ) {
    return 'claim is expired or not yet valid; sign a new one';
  }
  const payload = claimPayload({
    packageName,
    account: String(account).toLowerCase(),
    issuedAt: claim.issuedAt,
    registry,
  });
  if (!(await verifySignature(claim.publicKey, claim.signature, payload))) {
    return 'claim signature does not verify for this package, account and registry';
  }
  return null;
}

/**
 * Whether the account pushing a new package becomes its manager: with a claim
 * by a key of the bundle, or under a reserved prefix only staff and bots can create.
 * @returns {Promise<{ manager: boolean, refusal?: string }>}
 */
async function firstPublishManager({ claim, manifest, account, registry }) {
  if (claim === undefined) {
    return { manager: !!reservedPackagePrefix(manifest.package) };
  }
  if (!isAllowedOwner(manifest, claim?.publicKey)) {
    return {
      manager: false,
      refusal: 'claim must be signed by an owner key of this bundle',
    };
  }
  const refusal = await claimRefusal(claim, {
    packageName: manifest.package,
    account,
    registry,
  });
  return refusal ? { manager: false, refusal } : { manager: true };
}

/**
 * Make `email` the manager (and `username` the author) of every version of a
 * package whose current owner key signed `claim`. Shared by both servers.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function applyClaim({
  store,
  packageName,
  claim,
  email,
  username,
  registry,
  unlinkOrg,
}) {
  const versions = await store.getBundleVersions(packageName);
  if (!versions?.length) return { status: 404, body: { error: 'not_found' } };
  const latest = await store.getBundleManifest(packageName, versions[0]);
  if (!isAllowedOwner(latest, claim?.publicKey)) {
    return {
      status: 403,
      body: {
        error: 'not_owner',
        message: 'The claim must be signed by an owner key of the package.',
      },
    };
  }
  const refusal = await claimRefusal(claim, {
    packageName,
    account: email,
    registry,
  });
  if (refusal) {
    return { status: 400, body: { error: 'invalid_claim', message: refusal } };
  }

  const manager = email.toLowerCase();
  await unlinkOrg(packageName);
  for (let attempt = 0; attempt < CLAIM_WRITE_ATTEMPTS; attempt++) {
    let settled = true;
    for (const version of await store.getBundleVersions(packageName)) {
      const current = await store.getBundleManifest(packageName, version);
      if (!current || current.metadata?._ownerEmail === manager) continue;
      settled = false;
      await store.setManager(packageName, version, manager, username);
    }
    if (settled) return { status: 200, body: { package: packageName } };
  }
  return {
    status: 409,
    body: {
      error: 'claim_conflict',
      message: 'The package kept changing while it was claimed; try again.',
    },
  };
}

module.exports = {
  applyClaim,
  CLAIM_DOMAIN,
  claimPayload,
  claimRefusal,
  firstPublishManager,
};
