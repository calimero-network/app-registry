/**
 * Signs manifests with the scheme cargo-mero uses, so a test can exercise the
 * real verifier instead of mocking it.
 */

const crypto = require('crypto');
const canonicalize = require('canonicalize');

const ed25519 = () => import('@noble/ed25519');

async function generateKeypair() {
  const ed = await ed25519();
  const secretKey = ed.utils.randomSecretKey();
  return { secretKey, publicKey: await ed.getPublicKeyAsync(secretKey) };
}

/** SHA-256 of the RFC 8785 form, without `signature` and `_`-prefixed keys. */
function signingPayload(manifest) {
  const signed = Object.fromEntries(
    Object.entries(manifest).filter(
      ([key]) => key !== 'signature' && !key.startsWith('_')
    )
  );
  return crypto.createHash('sha256').update(canonicalize(signed)).digest();
}

async function signManifest(manifest, { secretKey, publicKey }) {
  const ed = await ed25519();
  const signature = await ed.signAsync(signingPayload(manifest), secretKey);
  return {
    ...manifest,
    signature: {
      algorithm: 'ed25519',
      publicKey: Buffer.from(publicKey).toString('base64url'),
      signature: Buffer.from(signature).toString('base64url'),
    },
  };
}

module.exports = { generateKeypair, signManifest };
