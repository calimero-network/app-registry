/**
 * Build signed request headers for org write API (X-Pubkey, X-Signature).
 * Payload: method + "\n" + pathname (no query) + "\n" + canonicalize(body).
 * Sign with Ed25519; send pubkey and signature as base64url.
 */

import * as ed25519 from '@noble/ed25519';
import canonicalize from 'canonicalize';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

const ENV_KEYPAIR = 'CALIMERO_REGISTRY_KEYPAIR';

function base64urlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build the same payload string the backend expects: method + "\n" + pathname + "\n" + canonicalize(body).
 */
/**
 * Match backend: empty or missing body → ''; otherwise canonicalize(body).
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

export interface KeypairLoadOptions {
  keypairPath?: string;
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * Load Ed25519 keypair from file or env.
 * Accepts two file formats:
 *   - mero-sign format: { private_key, public_key, signer_id } (base64url)
 *   - legacy format: JSON array of 64 numbers
 * Returns { publicKey: 32 bytes, secretKey: 32 bytes } for @noble/ed25519.
 */
export function loadKeypair(options?: KeypairLoadOptions): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  if (options?.keypairPath) {
    const resolved = path.resolve(options.keypairPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Keypair file not found: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);

    // mero-sign format: { private_key, public_key, signer_id }
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.private_key
    ) {
      const secretKey = base64urlDecode(parsed.private_key);
      const publicKey = base64urlDecode(parsed.public_key);
      if (secretKey.length !== 32 || publicKey.length !== 32) {
        throw new Error(
          'Invalid key file: private_key and public_key must be 32 bytes each'
        );
      }
      return { publicKey, secretKey };
    }

    // Legacy format: array of 64 numbers
    if (Array.isArray(parsed) && parsed.length === 64) {
      const bytes = new Uint8Array(parsed);
      const secretKey = bytes.slice(0, 32);
      const publicKey = bytes.slice(32, 64);
      return { publicKey, secretKey };
    }

    throw new Error(
      'Unrecognised key file format. Expected mero-sign JSON ({ private_key, public_key, signer_id }) or a legacy array of 64 numbers.'
    );
  }

  const env = process.env[ENV_KEYPAIR];
  if (!env || typeof env !== 'string' || !env.trim()) {
    throw new Error(
      `Missing keypair: set ${ENV_KEYPAIR} (base58 64-byte keypair) or use -k <path>`
    );
  }
  const decoded = bs58.decode(env.trim());
  if (decoded.length !== 64) {
    throw new Error(
      `Invalid keypair: ${ENV_KEYPAIR} must decode to 64 bytes (got ${decoded.length})`
    );
  }
  const bytes = new Uint8Array(decoded);
  const secretKey = bytes.slice(0, 32);
  const publicKey = bytes.slice(32, 64);
  return { publicKey, secretKey };
}

/**
 * Sign payload string (UTF-8) with secretKey; return pubkey and signature as base64url for headers.
 */
export async function signPayload(
  payload: string,
  secretKey: Uint8Array,
  publicKey: Uint8Array
): Promise<{ pubkeyBase64url: string; signatureBase64url: string }> {
  const message = new TextEncoder().encode(payload);
  const signature = await ed25519.signAsync(message, secretKey);
  return {
    pubkeyBase64url: base64urlEncode(publicKey),
    signatureBase64url: base64urlEncode(signature),
  };
}

/**
 * Get X-Pubkey and X-Signature headers for a signed request.
 * pathname must not include query string.
 */
export async function getSignedHeaders(
  method: string,
  pathname: string,
  body: Record<string, unknown> | null | undefined,
  keypair: { publicKey: Uint8Array; secretKey: Uint8Array }
): Promise<{ 'X-Pubkey': string; 'X-Signature': string }> {
  const payload = buildSignedPayload(method, pathname, body);
  const { pubkeyBase64url, signatureBase64url } = await signPayload(
    payload,
    keypair.secretKey,
    keypair.publicKey
  );
  return {
    'X-Pubkey': pubkeyBase64url,
    'X-Signature': signatureBase64url,
  };
}

/**
 * Encode 32-byte public key to base58 (for display).
 */
export function publicKeyToBase58(publicKey: Uint8Array): string {
  return bs58.encode(publicKey);
}

/**
 * Encode 32-byte public key to base64url (matches X-Pubkey header format used in signed requests,
 * and is how pubkeys are stored in Redis — use this for ?member= queries).
 */
export function publicKeyToBase64url(publicKey: Uint8Array): string {
  return base64urlEncode(publicKey);
}
