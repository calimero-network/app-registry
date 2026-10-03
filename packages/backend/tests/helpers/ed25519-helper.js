/**
 * Signs manifests with the scheme cargo-mero uses, so a test can exercise the
 * real verifier instead of mocking it.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');
const canonicalize = require('canonicalize');

const ed25519 = () => import('@noble/ed25519');

async function generateKeypair() {
  const ed = await ed25519();
  const secretKey = ed.utils.randomSecretKey();
  return { secretKey, publicKey: await ed.getPublicKeyAsync(secretKey) };
}

/** Domain tag cargo-mero prefixes to the canonical bytes before hashing. */
const MANIFEST_SIGNING_DOMAIN = Buffer.from('calimero.bundle.manifest.v1\0');

/**
 * SHA-256 of the domain tag followed by the RFC 8785 form, without `signature`
 * and `_`-prefixed keys.
 */
function signingPayload(manifest) {
  const signed = Object.fromEntries(
    Object.entries(manifest).filter(
      ([key]) => key !== 'signature' && !key.startsWith('_')
    )
  );
  return crypto
    .createHash('sha256')
    .update(MANIFEST_SIGNING_DOMAIN)
    .update(canonicalize(signed))
    .digest();
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

/** Signs a manifest for a fresh wasm and attaches the .mpk as `_binary`. */
async function signBundle(manifest, keys) {
  const wasm = crypto.randomBytes(64);
  const signed = await signManifest(
    {
      ...manifest,
      wasm: {
        path: 'app.wasm',
        hash: crypto.createHash('sha256').update(wasm).digest('hex'),
        size: wasm.length,
      },
    },
    keys
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpk-helper-'));
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(signed));
    fs.writeFileSync(path.join(dir, 'app.wasm'), wasm);
    const out = path.join(dir, 'bundle.mpk');
    tar.c({ gzip: true, file: out, cwd: dir, sync: true }, [
      'manifest.json',
      'app.wasm',
    ]);
    return { ...signed, _binary: fs.readFileSync(out).toString('hex') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { generateKeypair, signManifest, signBundle };
