/**
 * Ed25519 org identity helpers — public-key only.
 * Private keys are never generated or stored in the browser.
 * Use `mero-sign generate-key --output org-key.json` to create a keypair locally,
 * then import the `public_key` value here for org identity and membership lookup.
 */

const PUBKEY_STORAGE_KEY_BASE = 'calimero_registry_org_pubkey';

/**
 * Active user identifier (Google email, e.g. alice@example.com).
 * When set, all keypair storage is scoped to this value so that different
 * Google accounts each keep their own independent org identity in localStorage.
 * localStorage keys look like: calimero_registry_org_pubkey_alice@example.com
 */
let _currentUserId: string | null = null;

/** Call this from AuthContext whenever the logged-in Google account changes. */
export function setCurrentUserId(userId: string | null): void {
  _currentUserId = userId;
}

function PUBKEY_STORAGE_KEY(): string {
  return _currentUserId
    ? `${PUBKEY_STORAGE_KEY_BASE}_${_currentUserId}`
    : PUBKEY_STORAGE_KEY_BASE;
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58btcEncode(bytes: Uint8Array): string {
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let result = '';
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

/** Encode a 32-byte Ed25519 public key as a did:key identifier. */
export function publicKeyToDidKey(publicKey: Uint8Array): string {
  // Multicodec varint prefix for Ed25519 public key: 0xed 0x01
  const prefixed = new Uint8Array(34);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(publicKey, 2);
  return 'did:key:z' + base58btcEncode(prefixed);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad === 0 ? base64 : base64 + '='.repeat(4 - pad);
  if (typeof atob !== 'undefined') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * Import a public key (base64url-encoded 32 bytes) for org identity.
 * Stores it in localStorage — no private key is ever stored.
 * Returns true on success, false if the input is not a valid 32-byte base64url value.
 */
export function importPublicKey(pubkeyBase64url: string): boolean {
  try {
    const bytes = base64urlDecode(pubkeyBase64url.trim());
    if (bytes.length !== 32) return false;
    localStorage.setItem(PUBKEY_STORAGE_KEY(), base64urlEncode(bytes));
    return true;
  } catch {
    return false;
  }
}

/** Return the stored public key as base64url, or null if none. */
export function getStoredPublicKeyBase64url(): string | null {
  try {
    return localStorage.getItem(PUBKEY_STORAGE_KEY());
  } catch {
    return null;
  }
}

/** Remove the stored public key. */
export function clearStoredPublicKey(): void {
  try {
    localStorage.removeItem(PUBKEY_STORAGE_KEY());
  } catch {
    // ignore
  }
}

/** Encode 32-byte public key as base64url (for X-Pubkey and ?member=). */
export function publicKeyToBase64url(publicKey: Uint8Array): string {
  return base64urlEncode(publicKey);
}
