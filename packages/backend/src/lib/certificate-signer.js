const { canonicalizeJSON } = require('./verify');
const nacl = require('tweetnacl');

/**
 * Generate Ed25519 key pair for certificate signing
 */
function generateKeyPair() {
  const keyPair = nacl.sign.keyPair();

  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    privateKey: Buffer.from(keyPair.secretKey).toString('base64'),
  };
}

/**
 * Remove signature and private key fields from certificate for signing/verification
 */
function removeSignature(certificate) {
  const {
    signature: _signature, // eslint-disable-line no-unused-vars
    developer_private_key: _privateKey, // eslint-disable-line no-unused-vars
    ...certificateWithoutSignature
  } = certificate;
  return certificateWithoutSignature;
}

/**
 * Sign certificate with Ed25519
 */
function signCertificate(certificate, privateKey) {
  const certificateWithoutSignature = removeSignature(certificate);
  const canonicalized = canonicalizeJSON(certificateWithoutSignature);

  const privateKeyBuffer = Buffer.from(privateKey, 'base64');
  const dataBuffer = Buffer.from(canonicalized, 'utf8');

  const signature = nacl.sign.detached(dataBuffer, privateKeyBuffer);

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
 * Verify certificate signature
 */
function verifyCertificate(certificate) {
  if (
    !certificate.signature ||
    !certificate.signature.sig ||
    !certificate.signature.alg
  ) {
    throw new Error('Missing signature information');
  }

  if (certificate.signature.alg !== 'Ed25519') {
    throw new Error('Unsupported signature algorithm');
  }

  const certificateWithoutSignature = removeSignature(certificate);
  const canonicalized = canonicalizeJSON(certificateWithoutSignature);

  const publicKey = certificate.issuer_pubkey; // Certificate issuer's public key
  const signature = certificate.signature.sig;

  try {
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    const signatureBuffer = Buffer.from(signature, 'base64');
    const dataBuffer = Buffer.from(canonicalized, 'utf8');

    return nacl.sign.detached.verify(
      dataBuffer,
      signatureBuffer,
      publicKeyBuffer
    );
  } catch (error) {
    console.error('Certificate signature verification error:', error);
    return false;
  }
}

/**
 * Create a certificate template
 */
function createCertificateTemplate(
  developerPubkey,
  certificateId,
  issuerPubkey,
  expiresAt
) {
  return {
    developer_pubkey: developerPubkey,
    certificate_id: certificateId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: 'active',
    issuer: 'registry-admin',
    issuer_pubkey: issuerPubkey, // Add issuer's public key for verification
    signature: {
      alg: 'Ed25519',
      sig: '', // Will be filled by signCertificate
      signed_at: '', // Will be filled by signCertificate
    },
  };
}

module.exports = {
  generateKeyPair,
  signCertificate,
  verifyCertificate,
  createCertificateTemplate,
};
