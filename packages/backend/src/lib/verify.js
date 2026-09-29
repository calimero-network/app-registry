// Use require in CJS (Jest/Node) to avoid dynamic import under Jest VM
let ed25519;
const crypto = require('crypto');
const canonicalize = require('canonicalize');
const { multibase } = require('multibase');

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
 * Verify Ed25519 signature.
 * publicKey and signature may be base64url (mero-sign) or base58/multibase (legacy).
 * data must be the exact bytes that were signed (for mero-sign: 32-byte SHA-256 of canonical manifest).
 */
async function verifySignature(publicKey, signature, data) {
  // Outside the try: a verifier that cannot load must surface as an error,
  // not as `false` ("Invalid signature").
  const ed25519Module = await initEd25519();
  verifyLog('initEd25519 OK');
  try {
    // Decode public key: try base64url first (mero-sign), then multibase, then base58
    let decodedPubKey;
    let pubKeyEncoding = 'base64url';
    try {
      decodedPubKey = base64urlDecode(publicKey);
      if (decodedPubKey.length !== 32) decodedPubKey = null;
    } catch {
      decodedPubKey = null;
    }
    if (!decodedPubKey) {
      try {
        decodedPubKey = Buffer.from(multibase.decode(publicKey));
        pubKeyEncoding = 'multibase';
      } catch {
        decodedPubKey = decodeBase58ToBytes(publicKey);
        pubKeyEncoding = 'base58';
      }
    }
    if (decodedPubKey.length !== 32) {
      verifyLog('publicKey decode failed: length', decodedPubKey?.length);
      throw new Error('Invalid public key length');
    }
    verifyLog(
      'publicKey decoded:',
      pubKeyEncoding,
      'length',
      decodedPubKey.length
    );

    // Decode signature: try base64url first (mero-sign), then base64, then base58
    let decodedSig;
    let sigEncoding = 'base64url';
    try {
      decodedSig = base64urlDecode(signature);
      if (decodedSig.length !== 64) decodedSig = null;
    } catch {
      decodedSig = null;
    }
    if (!decodedSig) {
      try {
        decodedSig = Buffer.from(signature, 'base64');
        if (decodedSig.length !== 64) throw new Error('Invalid length');
        sigEncoding = 'base64';
      } catch {
        decodedSig = decodeBase58ToBytes(signature);
        sigEncoding = 'base58';
      }
    }
    if (decodedSig.length !== 64) {
      verifyLog('signature decode failed: length', decodedSig?.length);
      throw new Error('Invalid signature length');
    }
    verifyLog('signature decoded:', sigEncoding, 'length', decodedSig.length);

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    verifyLog(
      'payload length',
      dataBuffer.length,
      'payloadHash(hex)',
      dataBuffer.length === 32 ? dataBuffer.toString('hex') : '(not 32 bytes)'
    );

    // @noble/ed25519 exports verify/verifyAsync at top level (no .ed25519)
    const verifyFn = ed25519Module.verifyAsync ?? ed25519Module.verify;
    if (typeof verifyFn !== 'function') {
      throw verifierUnavailable(new Error('no verify/verifyAsync export'));
    }
    const ok = await verifyFn(
      new Uint8Array(decodedSig),
      new Uint8Array(dataBuffer),
      new Uint8Array(decodedPubKey)
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
 * Verify manifest signature (matches mero-sign flow).
 * 1. Remove signature and all _*-prefixed keys.
 * 2. RFC 8785 canonicalize -> canonical bytes.
 * 3. Signing payload = SHA-256(canonical bytes).
 * 4. Ed25519 verify(signature, payload, publicKey); publicKey/signature are base64url.
 */
async function verifyManifest(manifest) {
  const normalized = normalizeSignature(manifest?.signature);
  if (!normalized) {
    throw new Error('Missing signature information');
  }

  if ((normalized.alg || '').toLowerCase() !== 'ed25519') {
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
    .update(canonicalBytes)
    .digest();

  verifyLog(
    'canonical length',
    canonicalBytes.length,
    'signingPayloadHash(hex)',
    signingPayload.toString('hex')
  );

  const publicKey = normalized.pubkey;
  const signature = normalized.sig;

  const isValid = await verifySignature(publicKey, signature, signingPayload);
  if (!isValid) {
    verifyLog('verifySignature returned false');
    throw new Error('Invalid signature');
  }
  verifyLog('manifest signature valid');

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
