/**
 * Package claims: proof that an account is trusted by a package's signing key.
 *
 * A signed bundle names no account, so whoever pushes it first must not become
 * its manager on that alone. A claim is an Ed25519 signature by a package key
 * over the package, the account email and a timestamp; only an account holding
 * a fresh claim may manage the package.
 */

const crypto = require('crypto');
const canonicalize = require('canonicalize');
const { isAllowedOwner, verifySignature } = require('./verify');

const CLAIM_DOMAIN = Buffer.from('calimero.registry.package-claim.v1\0');
const CLAIM_MAX_AGE_MS = 10 * 60 * 1000; // bounds reuse of a claim the key holder has since replaced
const CLAIM_MAX_SKEW_MS = 60 * 1000; // tolerated clock drift for a claim dated in the future

/** SHA-256 of the domain tag and the RFC 8785 form of the claimed fields. */
function claimPayload({ packageName, account, issuedAt }) {
  return crypto
    .createHash('sha256')
    .update(CLAIM_DOMAIN)
    .update(canonicalize({ account, issuedAt, package: packageName }))
    .digest();
}

/**
 * The reason `claim` does not let `account` manage `packageName`, or null when
 * it does. The caller decides whether `claim.publicKey` is a package key.
 */
async function claimRefusal(claim, { packageName, account, now = Date.now() }) {
  if (
    !claim ||
    typeof claim !== 'object' ||
    typeof claim.publicKey !== 'string' ||
    typeof claim.signature !== 'string' ||
    typeof claim.issuedAt !== 'string'
  ) {
    return 'claim must carry publicKey, signature and issuedAt';
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
  });
  if (!(await verifySignature(claim.publicKey, claim.signature, payload))) {
    return 'claim signature does not verify for this package and account';
  }
  return null;
}

/** claimRefusal for a first publish: the claim must be by a key of the bundle itself. */
async function firstPublishClaimRefusal(claim, manifest, account) {
  if (!isAllowedOwner(manifest, claim?.publicKey)) {
    return 'claim must be signed by an owner key of this bundle';
  }
  return claimRefusal(claim, { packageName: manifest.package, account });
}

module.exports = {
  CLAIM_DOMAIN,
  claimPayload,
  claimRefusal,
  firstPublishClaimRefusal,
};
