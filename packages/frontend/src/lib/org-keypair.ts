/**
 * Ed25519 keypair for org write API (signed requests).
 * Randomly generated, stored in localStorage; not Solana or blockchain-related.
 */

import * as ed25519 from '@noble/ed25519';
import canonicalize from 'canonicalize';

const STORAGE_KEY_BASE = 'calimero_registry_org_keypair';
const PUBKEY_STORAGE_KEY_BASE = 'calimero_registry_org_pubkey';

/**
 * Active user identifier (Google email, e.g. alice@example.com).
 * When set, all keypair storage is scoped to this value so that different
 * Google accounts each keep their own independent org identity in localStorage.
 * localStorage keys look like: calimero_registry_org_keypair_alice@example.com
 */
let _currentUserId: string | null = null;

/** Call this from AuthContext whenever the logged-in Google account changes. */
export function setCurrentUserId(userId: string | null): void {
  _currentUserId = userId;
}

function STORAGE_KEY(): string {
  return _currentUserId
    ? `${STORAGE_KEY_BASE}_${_currentUserId}`
    : STORAGE_KEY_BASE;
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

export interface OrgKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Generate a new random Ed25519 keypair and optionally store it. */
export async function generateKeypair(store = true): Promise<OrgKeypair> {
  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = await ed25519.getPublicKeyAsync(secretKey);
  const keypair: OrgKeypair = { publicKey, secretKey };
  if (store) {
    try {
      localStorage.setItem(STORAGE_KEY(), base64urlEncode(secretKey));
    } catch {
      // localStorage full or private mode
    }
  }
  return keypair;
}

/** Load keypair from localStorage. Returns null if none stored. */
export async function getStoredKeypair(): Promise<OrgKeypair | null> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY());
    if (!stored) return null;
    const secretKey = base64urlDecode(stored);
    if (secretKey.length !== 32) return null;
    const publicKey = await ed25519.getPublicKeyAsync(secretKey);
    return { publicKey, secretKey };
  } catch {
    return null;
  }
}

/** Remove stored keypair. */
export function clearStoredKeypair(): void {
  try {
    localStorage.removeItem(STORAGE_KEY());
  } catch {
    // ignore
  }
}

/**
 * Import a public key (base64url-encoded 32 bytes) for read-only org identity.
 * Stores it separately from the signing keypair — no private key is stored.
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

/** Return the stored read-only public key as base64url, or null if none. */
export function getStoredPublicKeyBase64url(): string | null {
  try {
    return localStorage.getItem(PUBKEY_STORAGE_KEY());
  } catch {
    return null;
  }
}

/** Remove the stored read-only public key. */
export function clearStoredPublicKey(): void {
  try {
    localStorage.removeItem(PUBKEY_STORAGE_KEY());
  } catch {
    // ignore
  }
}

/** Return the signing keypair's secret key as base64url for backup/export. Returns null if no keypair stored. */
export function exportSecretKeyBase64url(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY());
  } catch {
    return null;
  }
}

/** Encode 32-byte public key as base64url (for X-Pubkey and ?member=). */
export function publicKeyToBase64url(publicKey: Uint8Array): string {
  return base64urlEncode(publicKey);
}

/**
 * Build the payload string the backend expects: method + "\n" + pathname + "\n" + canonicalize(body).
 */
export function buildSignedPayload(
  method: string,
  pathname: string,
  body: Record<string, unknown> | null | undefined
): string {
  const bodyObj = body != null && typeof body === 'object' ? body : {};
  const bodyStr =
    Object.keys(bodyObj).length > 0 ? (canonicalize(bodyObj) as string) : '';
  return `${method}\n${pathname}\n${bodyStr}`;
}

/**
 * Get X-Pubkey and X-Signature headers for a signed request.
 * pathname must not include query string (e.g. /api/v2/orgs).
 */
export async function getSignedHeaders(
  method: string,
  pathname: string,
  body: Record<string, unknown> | null | undefined,
  keypair: OrgKeypair
): Promise<{ 'X-Pubkey': string; 'X-Signature': string }> {
  const payload = buildSignedPayload(method, pathname, body);
  const message = new TextEncoder().encode(payload);
  const signature = await ed25519.signAsync(message, keypair.secretKey);
  return {
    'X-Pubkey': base64urlEncode(keypair.publicKey),
    'X-Signature': base64urlEncode(signature),
  };
}
