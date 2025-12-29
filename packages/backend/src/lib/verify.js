// Dynamic import for ES module
let ed25519;
const { multibase } = require('multibase');

// Initialize ed25519 module
async function initEd25519() {
  if (!ed25519) {
    ed25519 = await import('@noble/ed25519');
  }
  return ed25519;
}

/**
 * JSON Canonicalization Scheme (JCS) implementation
 * Canonicalizes JSON by sorting keys and removing whitespace
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
 * Remove transient fields from manifest for signing/verification
 * Strips signature, _binary, and _overwrite fields that are added at upload time
 */
function removeTransientFields(manifest) {
  /* eslint-disable no-unused-vars */
  const {
    signature: _signature,
    _binary: _binaryField,
    _overwrite: _overwriteField,
    ...manifestWithoutTransients
  } = manifest;
  /* eslint-enable no-unused-vars */
  return manifestWithoutTransients;
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

/**
 * Verify Ed25519 signature
 */
async function verifySignature(publicKey, signature, data) {
  try {
    // Ensure ed25519 is initialized
    const ed25519Module = await initEd25519();
    // Decode public key from base58 or multibase
    let decodedPubKey;
    try {
      decodedPubKey = multibase.decode(publicKey);
    } catch {
      // Try as base58 - use a simple base58 decoder
      const base58Chars =
        '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let decoded = 0n;
      for (let i = 0; i < publicKey.length; i++) {
        const char = publicKey[i];
        const charIndex = base58Chars.indexOf(char);
        if (charIndex === -1) {
          throw new Error('Invalid base58 character');
        }
        decoded = decoded * 58n + BigInt(charIndex);
      }

      // Convert to bytes
      const bytes = [];
      while (decoded > 0n) {
        bytes.unshift(Number(decoded % 256n));
        decoded = decoded / 256n;
      }
      decodedPubKey = Buffer.from(bytes);
    }

    // Decode signature: try base64 first; if fails, try base58
    let decodedSig;
    try {
      decodedSig = Buffer.from(signature, 'base64');
      if (decodedSig.length !== 64) throw new Error('Invalid base64 length');
    } catch {
      decodedSig = decodeBase58ToBytes(signature);
    }

    // Convert data to Buffer if it's a string
    const dataBuffer =
      typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    return ed25519Module.ed25519.verify(decodedSig, dataBuffer, decodedPubKey);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Verify manifest signature
 */
async function verifyManifest(manifest) {
  if (
    !manifest.signature ||
    !manifest.signature.sig ||
    !manifest.signature.alg
  ) {
    throw new Error('Missing signature information');
  }

  if ((manifest.signature.alg || '').toLowerCase() !== 'ed25519') {
    throw new Error('Unsupported signature algorithm');
  }

  const manifestWithoutTransients = removeTransientFields(manifest);
  const canonicalized = canonicalizeJSON(manifestWithoutTransients);

  const publicKey = manifest.signature.pubkey;
  const signature = manifest.signature.sig;

  const isValid = await verifySignature(publicKey, signature, canonicalized);
  if (!isValid) {
    throw new Error('Invalid signature');
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
  removeSignature: removeTransientFields, // Keep for backward compatibility
  removeTransientFields,
  verifySignature,
  verifyManifest,
  validateSemver,
  validatePublicKey,
};
