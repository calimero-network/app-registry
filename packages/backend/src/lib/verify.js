// Use require in CJS (Jest/Node) to avoid dynamic import under Jest VM
let ed25519;
const crypto = require('crypto');
const canonicalize = require('canonicalize');
const multibase = require('multibase');

// Load @noble/ed25519. It is ESM-only: require() works under Jest and plain
// Node 24, but Vercel's function loader (/opt/rust/nodejs.js) refuses it with
// ERR_REQUIRE_ESM even on Node 24 — so fall back to import() instead of failing.
// tests/no-require-esm.test.js keeps any other require() of an ES module out.
async function initEd25519() {
  if (!ed25519) {
    try {
      ed25519 =
        typeof require !== 'undefined'
          ? require('@noble/ed25519')
          : await import('@noble/ed25519');
    } catch (err) {
      if (
        err?.code !== 'ERR_REQUIRE_ESM' &&
        err?.code !== 'ERR_REQUIRE_ASYNC_MODULE'
      ) {
        throw verifierUnavailable(err);
      }
      try {
        ed25519 = await import('@noble/ed25519');
      } catch (importErr) {
        throw verifierUnavailable(importErr);
      }
    }
  }
  return ed25519;
}

/**
 * The verifier itself could not run. This is a server fault, never a verdict
 * on the signature, so it must not be reported as "Invalid signature".
 */
function verifierUnavailable(cause) {
  const err = new Error(
    `Ed25519 verifier unavailable: ${cause?.message ?? cause}`
  );
  err.code = 'verifier_unavailable';
  err.cause = cause;
  return err;
}

/**
 * Decode base64url (no padding) to Buffer.
 * Mero-sign stores publicKey and signature as base64url.
 */
function base64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad === 0 ? base64 : base64 + '='.repeat(4 - pad);
  return Buffer.from(padded, 'base64');
}

/**
 * JSON Canonicalization Scheme (JCS) implementation - custom key-sort (legacy).
 * For mero-sign verification we use RFC 8785 via the canonicalize package.
 */
function canonicalizeJSON(obj) {
  if (obj === null) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number') return obj.toString();
  if (typeof obj === 'boolean') return obj.toString();

  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJSON).join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map(key => `${JSON.stringify(key)}:${canonicalizeJSON(obj[key])}`)
      .join(',')}}`;
  }

  throw new Error('Unsupported type for canonicalization');
}

/**
 * Remove transient fields from manifest for signing/verification.
 * Strips signature and every key that starts with '_' (matches mero-sign canonicalization).
 */
function removeTransientFields(manifest) {
  const out = { ...manifest };
  delete out.signature;
  for (const key of Object.keys(out)) {
    if (key.startsWith('_')) delete out[key];
  }
  return out;
}

function decodeBase58ToBytes(input) {
  const base58Chars =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let decoded = 0n;
  let leadingZeros = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '1' && decoded === 0n) {
      leadingZeros += 1;
      continue;
    }
    const idx = base58Chars.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base58 character');
    decoded = decoded * 58n + BigInt(idx);
  }
  const bytes = [];
  while (decoded > 0n) {
    bytes.unshift(Number(decoded % 256n));
    decoded = decoded / 256n;
  }
  // Prepend leading zero bytes
  for (let i = 0; i < leadingZeros; i++) bytes.unshift(0);
  return Buffer.from(bytes);
}

const VERIFY_DEBUG =
  process.env.VERIFY_DEBUG === '1' || process.env.VERIFY_DEBUG === 'true';

function verifyLog(...args) {
  if (VERIFY_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[verify]', ...args);
  }
}

/**
 * Decode unpadded canonical base64url of exactly `bytes` bytes, the only form
 * core accepts for keys and signatures.
 */
function decodeStrictBase64url(text, bytes, label) {
  const chars = Math.ceil((bytes * 4) / 3);
  const decoded =
    typeof text === 'string' &&
    new RegExp(`^[A-Za-z0-9_-]{${chars}}$`).test(text)
      ? Buffer.from(text, 'base64url')
      : null;
  if (
    !decoded ||
    decoded.length !== bytes ||
    decoded.toString('base64url') !== text
  ) {
    throw new Error(`Invalid ${label} encoding`);
  }
  return decoded;
}

function decodePublicKey(publicKey) {
  return decodeStrictBase64url(publicKey, 32, 'public key');
}

/** The did:key form of an Ed25519 public key, as core derives `signerId`. */
function signerIdForPublicKey(publicKey) {
  const prefixed = Buffer.concat([Buffer.from([0xed, 0x01]), publicKey]);
  return `did:key:${Buffer.from(multibase.encode('base58btc', prefixed)).toString()}`;
}

/**
 * Same rules as ed25519-dalek `verify_strict`, which nodes use: canonical and
 * not small-order `A` and `R`, canonical `S`, cofactorless equation.
 */
function verifyStrict(ed25519Module, signature, message, publicKey) {
  for (const bytes of [publicKey, signature.subarray(0, 32)]) {
    let point;
    try {
      point = ed25519Module.Point.fromBytes(bytes, false);
    } catch {
      return false;
    }
    if (point.isSmallOrder()) return false;
  }
  const key = crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicKey.toString('base64url') },
    format: 'jwk',
  });
  return crypto.verify(null, message, key, signature);
}

/**
 * Verify Ed25519 signature; publicKey and signature are unpadded base64url.
 * data must be the exact bytes that were signed (for mero-sign: 32-byte SHA-256 of canonical manifest).
 */
async function verifySignature(publicKey, signature, data) {
  // Outside the try: a verifier that cannot load must surface as an error,
  // not as `false` ("Invalid signature").
  const ed25519Module = await initEd25519();
  verifyLog('initEd25519 OK');
  try {
    const decodedPubKey = decodePublicKey(publicKey);

    const decodedSig = decodeStrictBase64url(signature, 64, 'signature');

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    verifyLog(
      'payload length',
      dataBuffer.length,
      'payloadHash(hex)',
      dataBuffer.length === 32 ? dataBuffer.toString('hex') : '(not 32 bytes)'
    );

    if (typeof ed25519Module.Point?.fromBytes !== 'function') {
      throw verifierUnavailable(new Error('no Point export'));
    }
    const ok = verifyStrict(
      ed25519Module,
      Buffer.from(decodedSig),
      dataBuffer,
      Buffer.from(decodedPubKey)
    );
    verifyLog('verify result:', ok);
    return ok;
  } catch (error) {
    if (error?.code === 'verifier_unavailable') throw error;
    // eslint-disable-next-line no-console
    console.error('Signature verification error:', error);
    if (VERIFY_DEBUG && error.stack) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * Normalize signature object to canonical keys (alg, pubkey, sig)
 * Accepts both core format (algorithm, publicKey, signature) and API format (alg, pubkey, sig)
 */
function normalizeSignature(signatureObj) {
  if (!signatureObj) return null;
  const alg = signatureObj.alg ?? signatureObj.algorithm;
  const pubkey = signatureObj.pubkey ?? signatureObj.publicKey;
  const sig = signatureObj.sig ?? signatureObj.signature;
  if (!alg || !pubkey || !sig) return null;
  return { alg, pubkey, sig };
}

/**
 * Get the public key from a bundle manifest's signature (for ownership comparison).
 * Returns the normalized public key string or null if missing.
 */
function getPublicKeyFromManifest(manifest) {
  const normalized = normalizeSignature(manifest?.signature);
  return normalized ? normalized.pubkey : null;
}

/**
 * The set of signing keys that may publish or edit after this manifest.
 *
 * - `_ownerKeys` (server-stamped, outside the signature) wins when present: a
 *   version published by an organization admin with their own key carries the
 *   package's existing key set forward here, so that publish does not change
 *   who owns the package by key.
 * - Otherwise a non-empty `owners[]` from the signed manifest.
 * - Otherwise the manifest's own signer.
 *
 * @returns {string[]}
 */
function getOwnerKeys(manifest) {
  const clean = list =>
    Array.isArray(list)
      ? list.filter(k => typeof k === 'string' && k.trim() !== '')
      : [];
  const stamped = clean(manifest?._ownerKeys);
  if (stamped.length > 0) return stamped;
  const owners = clean(manifest?.owners);
  if (owners.length > 0) return owners;
  const signer = getPublicKeyFromManifest(manifest);
  return signer != null ? [signer] : [];
}

/**
 * Check if an incoming key is allowed to publish or edit (ownership): the key
 * must be in getOwnerKeys(existingManifest).
 */
function isAllowedOwner(existingManifest, incomingKey) {
  if (incomingKey == null) return false;
  return getOwnerKeys(existingManifest).includes(incomingKey);
}

/**
 * Domain tag mero-sign prefixes to the canonical manifest before hashing, so a
 * signature over a manifest is not valid for any other message the key signs.
 * Must match `MANIFEST_SIGNING_DOMAIN` in core's `calimero-bundle` crate.
 */
const MANIFEST_SIGNING_DOMAIN = Buffer.from(
  'calimero.bundle.manifest.v1\0',
  'utf8'
);

/**
 * Verify manifest signature (matches mero-sign flow).
 * 1. Remove signature and all _*-prefixed keys.
 * 2. RFC 8785 canonicalize -> canonical bytes.
 * 3. Signing payload = SHA-256(MANIFEST_SIGNING_DOMAIN || canonical bytes).
 * 4. Ed25519 verify(signature, payload, publicKey); publicKey/signature are strict base64url.
 */
async function verifyManifest(manifest) {
  const { algorithm, publicKey, signature } = manifest?.signature ?? {};
  if (!algorithm || !publicKey || !signature) {
    throw new Error('Missing signature information');
  }

  if (algorithm !== 'ed25519') {
    throw new Error('Unsupported signature algorithm');
  }

  const manifestWithoutTransients = removeTransientFields(manifest);
  verifyLog(
    'manifest without transients keys:',
    Object.keys(manifestWithoutTransients).sort().join(', ')
  );

  // RFC 8785 (JCS) canonicalization
  const canonicalStr = canonicalize(manifestWithoutTransients);
  if (typeof canonicalStr !== 'string') {
    throw new Error('Canonicalization failed');
  }
  const canonicalBytes = Buffer.from(canonicalStr, 'utf8');
  const signingPayload = crypto
    .createHash('sha256')
    .update(MANIFEST_SIGNING_DOMAIN)
    .update(canonicalBytes)
    .digest();

  verifyLog(
    'canonical length',
    canonicalBytes.length,
    'signingPayloadHash(hex)',
    signingPayload.toString('hex')
  );

  const isValid = await verifySignature(publicKey, signature, signingPayload);
  if (!isValid) {
    verifyLog('verifySignature returned false');
    throw new Error('Invalid signature');
  }
  verifyLog('manifest signature valid');

  const expectedSignerId = signerIdForPublicKey(decodePublicKey(publicKey));
  if (manifest.signerId !== expectedSignerId) {
    throw new Error(
      `signerId must be the signing key's did:key (${expectedSignerId})`
    );
  }

  return true;
}

/**
 * Validate semver format
 */
function validateSemver(semver) {
  const semverRegex =
    /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
  return semverRegex.test(semver);
}

/**
 * Validate public key format (base64url, base58, or multibase)
 */
function validatePublicKey(pubkey) {
  if (!pubkey || typeof pubkey !== 'string' || !pubkey.trim()) return false;
  const trimmed = pubkey.trim();
  // base64url (CLI / mero-sign)
  try {
    const decoded = base64urlDecode(trimmed);
    if (decoded.length === 32) return true;
  } catch {
    // continue
  }
  try {
    const decoded = multibase.decode(trimmed);
    return Buffer.from(decoded).length === 32;
  } catch {
    try {
      const bytes = decodeBase58ToBytes(trimmed);
      return bytes.length === 32;
    } catch {
      return false;
    }
  }
}

module.exports = {
  MANIFEST_SIGNING_DOMAIN,
  canonicalizeJSON,
  getPublicKeyFromManifest,
  isAllowedOwner,
  getOwnerKeys,
  normalizeSignature,
  removeSignature: removeTransientFields, // Keep for backward compatibility
  removeTransientFields,
  verifySignature,
  verifyManifest,
  validateSemver,
  validatePublicKey,
};
