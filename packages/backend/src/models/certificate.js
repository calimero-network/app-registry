const { validatePublicKey } = require('../lib/verify');
const { verifyCertificate } = require('../lib/certificate-signer');
const { isDeveloperWhitelistedByPubkey } = require('./developer-registry');

// In-memory storage for certificates (replace with database in production)
const certificates = new Map();

// Add some sample certificates for testing
const sampleCertificates = [
  {
    developer_pubkey:
      'ed25519:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    certificate_id: 'cert-001',
    issued_at: '2024-01-01T00:00:00Z',
    expires_at: '2025-12-31T23:59:59Z',
    status: 'active',
    issuer: 'registry-admin',
    issuer_pubkey: 'dGVzdC1wdWJsaWMta2V5LWZvci1kZW1vbnN0cmF0aW9u',
    signature: {
      alg: 'Ed25519',
      sig: 'dGVzdC1zaWduYXR1cmUtZm9yLWRlbW9uc3RyYXRpb24tZG9uLXQtdXNlLWluLXByb2R1Y3Rpb24=',
      signed_at: '2024-01-01T00:00:00Z',
    },
  },
  {
    developer_pubkey:
      'ed25519:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    certificate_id: 'cert-002',
    issued_at: '2024-01-01T00:00:00Z',
    expires_at: '2025-12-31T23:59:59Z',
    status: 'active',
    issuer: 'registry-admin',
    issuer_pubkey: 'dGVzdC1wdWJsaWMta2V5LWZvci1kZW1vbnN0cmF0aW9u',
    signature: {
      alg: 'Ed25519',
      sig: 'dGVzdC1zaWduYXR1cmUtZm9yLWRlbW9uc3RyYXRpb24tZG9uLXQtdXNlLWluLXByb2R1Y3Rpb24=',
      signed_at: '2024-01-01T00:00:00Z',
    },
  },
  // Real developer certificate
  {
    developer_pubkey: 'ed25519:HmfQPNZqEbM8vBUe6hmWJ87KYZJRQEtSFf2BvSfwVszq',
    certificate_id: 'real-dev-cert',
    issued_at: '2025-09-01T10:42:24.289Z',
    expires_at: '2025-12-31T22:59:59.999Z',
    status: 'active',
    issuer: 'registry-admin',
    issuer_pubkey: 'KwfW7NDSr7jUgUNvBPDASJMgBHaQQF3JPtdk4r9jsnQ=',
    signature: {
      alg: 'Ed25519',
      sig: 'omMRhaj2JVSVBtI1sfM04LFTlzq3C76zgEd7fEAxXSHDVdeDhpQbcRejMleLl4kLpQOqz+SUkbT1fFM3n9oIhg==',
      signed_at: '2025-09-01T10:42:24.289Z',
    },
  },
];

// Initialize with sample certificates
sampleCertificates.forEach(cert => {
  certificates.set(cert.developer_pubkey, cert);
});

// Certificate validation functions
function validateCertificate(certificate) {
  if (!certificate || typeof certificate !== 'object') {
    return { valid: false, error: 'Invalid certificate format' };
  }

  const requiredFields = [
    'developer_pubkey',
    'certificate_id',
    'issued_at',
    'expires_at',
    'status',
    'issuer',
    'issuer_pubkey',
    'signature',
  ];
  for (const field of requiredFields) {
    if (!certificate[field]) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  if (!validatePublicKey(certificate.developer_pubkey)) {
    return { valid: false, error: 'Invalid developer public key' };
  }

  if (!['active', 'revoked'].includes(certificate.status)) {
    return { valid: false, error: 'Invalid certificate status' };
  }

  const now = new Date();
  const expiresAt = new Date(certificate.expires_at);

  if (expiresAt < now) {
    return { valid: false, error: 'Certificate has expired' };
  }

  // Verify certificate signature
  try {
    const signatureValid = verifyCertificate(certificate);
    if (!signatureValid) {
      return { valid: false, error: 'Invalid certificate signature' };
    }
  } catch (error) {
    return {
      valid: false,
      error: `Signature verification failed: ${error.message}`,
    };
  }

  return { valid: true };
}

function isDeveloperWhitelisted(developerPubkey) {
  // First check the new developer registry
  const registryCheck = isDeveloperWhitelistedByPubkey(developerPubkey);
  if (registryCheck.whitelisted) {
    const validation = validateCertificate(registryCheck.certificate);
    if (validation.valid) {
      return {
        whitelisted: true,
        certificate: registryCheck.certificate,
        developer: registryCheck.developer,
      };
    } else {
      return { whitelisted: false, error: validation.error };
    }
  }

  // Fallback to old in-memory certificates for backward compatibility
  const certificate = certificates.get(developerPubkey);

  if (!certificate) {
    return { whitelisted: false, error: 'Developer not found in whitelist' };
  }

  const validation = validateCertificate(certificate);
  if (!validation.valid) {
    return { whitelisted: false, error: validation.error };
  }

  return { whitelisted: true, certificate };
}

function addCertificate(certificate) {
  const validation = validateCertificate(certificate);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  certificates.set(certificate.developer_pubkey, certificate);
  return certificate;
}

function revokeCertificate(developerPubkey) {
  const certificate = certificates.get(developerPubkey);
  if (!certificate) {
    throw new Error('Certificate not found');
  }

  certificate.status = 'revoked';
  certificates.set(developerPubkey, certificate);
  return certificate;
}

function getCertificate(developerPubkey) {
  return certificates.get(developerPubkey);
}

function getAllCertificates() {
  return Array.from(certificates.values());
}

module.exports = {
  validateCertificate,
  isDeveloperWhitelisted,
  addCertificate,
  revokeCertificate,
  getCertificate,
  getAllCertificates,
};
