const ed25519 = require('ed25519-supercop');
const { multibase } = require('multibase');

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
 * Remove signature field from manifest for signing
 */
function removeSignature(manifest) {
  // eslint-disable-next-line no-unused-vars
  const { signature: _signature, ...manifestWithoutSignature } = manifest;
  return manifestWithoutSignature;
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
function verifySignature(publicKey, signature, data) {
  try {
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

    return ed25519.verify(decodedSig, dataBuffer, decodedPubKey);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Verify manifest signature
 */
function verifyManifest(manifest) {
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

  const manifestWithoutSignature = removeSignature(manifest);
  const canonicalized = canonicalizeJSON(manifestWithoutSignature);

  const publicKey = manifest.app.developer_pubkey;
  const signature = manifest.signature.sig;

  const isValid = verifySignature(publicKey, signature, canonicalized);
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
  removeSignature,
  verifySignature,
  verifyManifest,
  validateSemver,
  validatePublicKey,
};
