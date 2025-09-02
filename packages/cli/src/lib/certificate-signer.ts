/* eslint-disable */
import { getPublicKey, sign, verify } from '@noble/ed25519';
import { randomBytes } from 'crypto';
import { Buffer } from 'buffer';

/**
 * Generate real Ed25519 key pair
 */
export function generateKeyPair() {
  const privateKey = randomBytes(32);
  const publicKey = getPublicKey(privateKey);

  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: privateKey.toString('base64'),
  };
}

/**
 * Create a certificate template
 */
export function createCertificateTemplate(
  developerPubkey: string,
  certificateId: string,
  issuerPubkey: string,
  expiresAt: string
) {
  return {
    developer_pubkey: developerPubkey,
    certificate_id: certificateId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: 'active' as const,
    issuer: 'registry-admin',
    issuer_pubkey: issuerPubkey,
    signature: {
      alg: 'Ed25519',
      sig: '', // Will be filled by signCertificate
      signed_at: '', // Will be filled by signCertificate
    },
  };
}

/**
 * Sign certificate with real Ed25519 signature
 */
export async function signCertificate(certificate: any, privateKey: string) {
  // Remove signature field and canonicalize

  const { signature: _sig1, ...certificateWithoutSignature } = certificate;
  const canonicalized = JSON.stringify(
    certificateWithoutSignature,
    Object.keys(certificateWithoutSignature).sort()
  );

  const privateKeyBuffer = Buffer.from(privateKey, 'base64');
  const dataBuffer = Buffer.from(canonicalized, 'utf8');

  const signature = await sign(dataBuffer, privateKeyBuffer);

  return {
    ...certificate,
    signature: {
      alg: 'Ed25519',
      sig: Buffer.from(signature).toString('base64'),
      signed_at: new Date().toISOString(),
    },
  };
}

/**
 * Verify certificate signature with real Ed25519 verification
 */
export async function verifyCertificate(certificate: any): Promise<boolean> {
  try {
    if (
      !certificate.signature ||
      !certificate.signature.alg ||
      !certificate.signature.sig ||
      !certificate.signature.signed_at
    ) {
      return false;
    }

    if (certificate.signature.alg !== 'Ed25519') {
      return false;
    }

    // Remove signature field and canonicalize

    const { signature: _sig, ...certificateWithoutSignature } = certificate;
    const canonicalized = JSON.stringify(
      certificateWithoutSignature,
      Object.keys(certificateWithoutSignature).sort()
    );

    const publicKey = certificate.issuer_pubkey;
    const signatureBytes = Buffer.from(certificate.signature.sig, 'base64');
    const dataBuffer = Buffer.from(canonicalized, 'utf8');
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');

    return await verify(signatureBytes, dataBuffer, publicKeyBuffer);
  } catch (error) {
    console.error('Certificate verification error:', error);
    return false;
  }
}
