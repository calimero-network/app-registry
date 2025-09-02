import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// @ts-expect-error - Node.js fetch global not typed
declare const fetch: any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Certificate {
  developer_pubkey: string;
  certificate_id: string;
  issued_at: string;
  expires_at: string;
  status: 'active' | 'revoked' | 'expired' | 'not_found';
  issuer: string;
  issuer_pubkey: string;
  signature: {
    algorithm: string;
    value: string;
  };
}

export type CertificateStatus = 'valid' | 'expired' | 'revoked' | 'not_found';

const CERTIFICATE_DIR = path.join(os.homedir(), '.ssapp-registry');
const CERTIFICATE_FILE = path.join(CERTIFICATE_DIR, 'certificate.json');

/**
 * Ensure the certificate directory exists
 */
function ensureCertDir(): void {
  if (!fs.existsSync(CERTIFICATE_DIR)) {
    fs.mkdirSync(CERTIFICATE_DIR, { recursive: true });
  }
}

/**
 * Load certificate from local storage
 */
export function loadCertificate(): Certificate | null {
  try {
    if (!fs.existsSync(CERTIFICATE_FILE)) {
      return null;
    }

    const certData = fs.readFileSync(CERTIFICATE_FILE, 'utf8');
    const certificate: Certificate = JSON.parse(certData);

    // Basic validation
    if (!certificate.developer_pubkey || !certificate.certificate_id) {
      return null;
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(certificate.expires_at);

    if (expiresAt < now) {
      return {
        ...certificate,
        status: 'expired',
      };
    }

    return certificate;
  } catch {
    return null;
  }
}

/**
 * Save certificate to local storage
 */
export function saveCertificate(certificate: Certificate): void {
  ensureCertDir();
  fs.writeFileSync(CERTIFICATE_FILE, JSON.stringify(certificate, null, 2));
}

/**
 * Remove certificate from local storage
 */
export function removeCertificate(): void {
  if (fs.existsSync(CERTIFICATE_FILE)) {
    fs.unlinkSync(CERTIFICATE_FILE);
  }
}

/**
 * Create a client with automatic certificate injection
 */
export function createClientWithCertificate(registryUrl: string): any {
  const cert = loadCertificate();

  // Return a mock client that automatically includes certificate
  return {
    registryUrl,
    certificate: cert,
    headers: cert ? { 'X-Developer-Certificate': cert.certificate_id } : {},
  };
}

/**
 * Validate certificate with server
 */
export async function validateCertificateWithServer(
  pubkey: string,
  registryUrl: string
): Promise<{ whitelisted: boolean; message?: string }> {
  try {
    // URL encode the public key to handle special characters
    const encodedPubkey = encodeURIComponent(pubkey);

    // Make actual API call to validate certificate
    const response = await fetch(
      `${registryUrl}/certificates/${encodedPubkey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        whitelisted: data.whitelisted,
        message: `Certificate validated: ${data.certificate?.certificate_id}`,
      };
    } else if (response.status === 404) {
      return {
        whitelisted: false,
        message: 'Developer not found in whitelist',
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        whitelisted: false,
        message: errorData.error || 'Certificate validation failed',
      };
    }
  } catch (error) {
    return {
      whitelisted: false,
      message: `Failed to validate certificate: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get the path where certificate is stored
 */
export function getCertificatePath(): string {
  return CERTIFICATE_FILE;
}

/**
 * Ensure developer has a valid certificate
 * No longer auto-generates - requires admin-issued certificate
 */
export async function ensureValidCertificate(
  registryUrl: string
): Promise<Certificate> {
  const existingCert = loadCertificate();

  if (!existingCert) {
    throw new Error(
      'No certificate found. Please install a certificate using: ssapp-registry certificate install <certificate-file>'
    );
  }

  if (!isCertificateValid(existingCert)) {
    throw new Error(
      'Certificate is expired or invalid. Please contact the registry administrator for a new certificate.'
    );
  }

  // Validate with server
  const validation = await validateCertificateWithServer(
    existingCert.developer_pubkey,
    registryUrl
  );
  if (!validation.whitelisted) {
    throw new Error(`Certificate validation failed: ${validation.message}`);
  }

  return existingCert;
}

/**
 * Generate a new certificate
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateAndRegisterCertificate(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  registryUrl: string
): Promise<Certificate> {
  // Generate a unique certificate ID
  const certId = `auto-gen-${Date.now()}`;

  // Create certificate template
  const cert: Certificate = {
    developer_pubkey: generateMockPublicKey(),
    certificate_id: certId,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    status: 'active',
    issuer: 'auto-registry',
    issuer_pubkey: 'auto-issuer-key',
    signature: {
      algorithm: 'ed25519',
      value: 'auto-generated-signature',
    },
  };

  // Save locally
  saveCertificate(cert);
  console.log(
    '📝 Certificate saved locally. In production, this would be registered with the registry.'
  );

  return cert;
}

/**
 * Check if a certificate is valid (not expired, not revoked)
 */
function isCertificateValid(cert: Certificate): boolean {
  if (cert.status !== 'active') return false;

  const now = new Date();
  const expiresAt = new Date(cert.expires_at);

  return expiresAt > now;
}

/**
 * Generate a mock public key for demo purposes
 * In real implementation, this would be the developer's actual public key
 */
function generateMockPublicKey(): string {
  // Generate a realistic-looking ed25519 key
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ed25519:${result}`;
}
