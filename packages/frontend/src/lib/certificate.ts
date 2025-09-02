export interface Certificate {
  developer_pubkey: string;
  certificate_id: string;
  issued_at: string;
  expires_at: string;
  status: 'active' | 'revoked';
  issuer: string;
  issuer_pubkey: string;
  signature: {
    alg: string;
    sig: string;
    signed_at: string;
  };
}

export interface CertificateStatus {
  hasCertificate: boolean;
  certificate?: Certificate;
  error?: string;
}

const CERT_STORAGE_KEY = 'ssapp-registry-certificate';

/**
 * Load certificate from browser storage
 */
export function loadCertificate(): CertificateStatus {
  try {
    const certData = localStorage.getItem(CERT_STORAGE_KEY);

    if (!certData) {
      return { hasCertificate: false, error: 'No certificate found' };
    }

    const certificate: Certificate = JSON.parse(certData);

    // Basic validation
    if (!certificate.developer_pubkey || !certificate.certificate_id) {
      return { hasCertificate: false, error: 'Invalid certificate format' };
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(certificate.expires_at);

    if (expiresAt < now) {
      return { hasCertificate: false, error: 'Certificate has expired' };
    }

    return { hasCertificate: true, certificate };
  } catch (error) {
    return {
      hasCertificate: false,
      error:
        error instanceof Error ? error.message : 'Failed to load certificate',
    };
  }
}

/**
 * Save certificate to browser storage
 */
export function saveCertificate(certificate: Certificate): void {
  localStorage.setItem(CERT_STORAGE_KEY, JSON.stringify(certificate));
}

/**
 * Remove certificate from browser storage
 */
export function removeCertificate(): void {
  localStorage.removeItem(CERT_STORAGE_KEY);
}

/**
 * Get certificate headers for API requests
 */
export function getCertificateHeaders(): Record<string, string> {
  const certStatus = loadCertificate();

  if (certStatus.hasCertificate && certStatus.certificate) {
    return {
      'X-Developer-Certificate': certStatus.certificate.certificate_id,
    };
  }

  return {};
}

/**
 * Validate certificate with the server
 */
export async function validateCertificateWithServer(
  api: { get: (url: string) => Promise<{ data: { whitelisted: boolean } }> },
  pubkey: string
): Promise<boolean> {
  try {
    const response = await api.get(`/certificates/${pubkey}`);
    return response.data.whitelisted;
  } catch {
    return false;
  }
}
