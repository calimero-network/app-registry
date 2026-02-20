// Dynamic import for ES module
let ed25519;
const crypto = require('crypto');
const canonicalize = require('canonicalize');
const { multibase } = require('multibase');

// Initialize ed25519 module
async function initEd25519() {
  if (!ed25519) {
    ed25519 = await import('@noble/ed25519');
  }
  return ed25519;
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
  try {
    const ed25519Module = await initEd25519();
    verifyLog('initEd25519 OK');

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
      throw new Error('Ed25519 verify not available');
    }
    const ok = await verifyFn(
      new Uint8Array(decodedSig),
      new Uint8Array(dataBuffer),
      new Uint8Array(decodedPubKey)
    );
    verifyLog('verify result:', ok);
    return ok;
  } catch (error) {
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
 * Check if an incoming key is allowed to publish or edit (ownership).
 * If manifest.owners is a non-empty array, any key in that array is allowed.
 * Otherwise, only the signer key of the manifest (first publisher) is allowed.
 */
function isAllowedOwner(existingManifest, incomingKey) {
  if (incomingKey == null) return false;
  const owners = existingManifest?.owners;
  if (Array.isArray(owners) && owners.length > 0) {
    return owners.some(
      (k) => typeof k === 'string' && k.trim() !== '' && k === incomingKey
    );
  }
  const ownerKey = getPublicKeyFromManifest(existingManifest);
  return ownerKey != null && ownerKey === incomingKey;
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
 * Validate public key format (base58 or multibase)
 */
function validatePublicKey(pubkey) {
  try {
    const decoded = multibase.decode(pubkey);
    return Buffer.from(decoded).length === 32;
  } catch {
    // Try base58
    try {
      const bytes = decodeBase58ToBytes(pubkey);
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
  normalizeSignature,
  removeSignature: removeTransientFields, // Keep for backward compatibility
  removeTransientFields,
  verifySignature,
  verifyManifest,
  validateSemver,
  validatePublicKey,
};
