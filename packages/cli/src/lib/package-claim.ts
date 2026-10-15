import crypto from 'crypto';
import fs from 'fs';

/** Must match CLAIM_DOMAIN in the registry backend's package-claim.js. */
const CLAIM_DOMAIN = Buffer.from('calimero.registry.package-claim.v1\0');
const PKCS8_ED25519_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);

export interface PackageClaim {
  publicKey: string;
  signature: string;
  issuedAt: string;
}

/** Loads a mero-sign / cargo-mero key file (`{ "private_key": <base64url seed> }`). */
export function loadSigningKey(keyFile: string): crypto.KeyObject {
  const parsed = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as {
    private_key?: string;
  };
  const seed = Buffer.from(parsed.private_key ?? '', 'base64url');
  if (seed.length !== 32) {
    throw new Error(`${keyFile} is not an Ed25519 key file`);
  }
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** Signs a claim that `account` may manage `packageName` on the registry at `registryUrl`. */
export function signClaim(
  key: crypto.KeyObject,
  packageName: string,
  account: string,
  registryUrl: string,
  issuedAt = new Date().toISOString()
): PackageClaim {
  // Keys in sorted order with plain string values: JSON.stringify is the RFC 8785 form.
  const canonical = JSON.stringify({
    account: account.toLowerCase(),
    issuedAt,
    package: packageName.toLowerCase(),
    registry: new URL(registryUrl).origin,
  });
  const payload = crypto
    .createHash('sha256')
    .update(CLAIM_DOMAIN)
    .update(canonical)
    .digest();
  const jwk = crypto.createPublicKey(key).export({ format: 'jwk' });
  return {
    publicKey: String(jwk.x),
    signature: crypto.sign(null, payload, key).toString('base64url'),
    issuedAt,
  };
}

/** The email of the account `apiKey` belongs to, which a claim must name. */
export async function fetchAccountEmail(
  registryUrl: string,
  apiKey?: string
): Promise<string> {
  const res = await fetch(`${registryUrl.replace(/\/$/, '')}/api/auth/me`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  const body = (await res.json().catch(() => ({}))) as {
    user?: { email?: unknown };
  };
  if (!res.ok || typeof body.user?.email !== 'string') {
    throw new Error(
      `Could not read your account from ${registryUrl} (${res.status}); check the API key`
    );
  }
  return body.user.email;
}
