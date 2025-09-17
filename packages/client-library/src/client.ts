import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
  ApiError,
  ClientConfig,
} from './types';

/**
 * SSApp Registry Client
 *
 * A TypeScript client for interacting with the SSApp (Smart Contract Application) Registry API.
 * Provides type-safe methods for managing applications, developers, and attestations.
 *
 * @example
 * ```typescript
 * import { SSAppRegistryClient } from '@calimero-network/registry-client';
 *
 * const client = new SSAppRegistryClient({
 *   baseURL: 'https://api.calimero.network',
 *   timeout: 10000,
 * });
 *
 * // Get all applications
 * const apps = await client.getApps();
 *
 * // Get specific application versions
 * const versions = await client.getAppVersions('developer-pubkey', 'app-name');
 * ```
 */
export class SSAppRegistryClient {
  private api: AxiosInstance;

  /**
   * Creates a new SSApp Registry client instance.
   *
   * @param config - Configuration options for the client
   * @param config.baseURL - Base URL for the API (default: 'http://localhost:8082')
   * @param config.timeout - Request timeout in milliseconds (default: 10000)
   * @param config.headers - Additional headers to include in requests
   *
   * @example
   * ```typescript
   * // Basic configuration
   * const client = new SSAppRegistryClient();
   *
   * // Custom configuration
   * const client = new SSAppRegistryClient({
   *   baseURL: 'https://api.calimero.network',
   *   timeout: 30000,
   *   headers: {
   *     'Authorization': 'Bearer token',
   *   },
   * });
   * ```
   */
  constructor(config: ClientConfig = {}) {
    this.api = axios.create({
      baseURL: config.baseURL || 'http://localhost:8082',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Error interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      error => {
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message,
          code: error.response?.data?.code,
          details: error.response?.data?.details,
        };
        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Retrieves a list of all applications with optional filtering.
   *
   * @param params - Optional filtering parameters
   * @param params.dev - Filter by developer public key
   * @param params.name - Filter by application name (partial match)
   * @returns Promise resolving to an array of application summaries
   *
   * @example
   * ```typescript
   * // Get all applications
   * const allApps = await client.getApps();
   *
   * // Filter by developer
   * const devApps = await client.getApps({ dev: 'ed25519:abc123...' });
   *
   * // Filter by name
   * const walletApps = await client.getApps({ name: 'wallet' });
   *
   * // Filter by both
   * const filteredApps = await client.getApps({
   *   dev: 'ed25519:abc123...',
   *   name: 'wallet'
   * });
   * ```
   *
   * @throws {ApiError} When the API request fails
   */
  async getApps(params?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    const response = await this.api.get('/apps', { params });
    return response.data;
  }

  /**
   * Retrieves all versions of a specific application.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @param appName - Name of the application
   * @returns Promise resolving to an array of version information
   *
   * @example
   * ```typescript
   * const versions = await client.getAppVersions(
   *   'ed25519:abc123...',
   *   'my-wallet-app'
   * );
   *
   * versions.forEach(version => {
   *   console.log(`Version ${version.semver}: ${version.cid}`);
   *   if (version.yanked) {
   *     console.log('  ⚠️  This version has been yanked');
   *   }
   * });
   * ```
   *
   * @throws {ApiError} When the application is not found or request fails
   */
  async getAppVersions(
    pubkey: string,
    appName: string
  ): Promise<VersionInfo[]> {
    const response = await this.api.get(`/apps/${pubkey}/${appName}`);
    return response.data;
  }

  /**
   * Retrieves the complete manifest for a specific application version.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @param appName - Name of the application
   * @param semver - Semantic version (e.g., '1.0.0', '2.1.3')
   * @returns Promise resolving to the application manifest
   *
   * @example
   * ```typescript
   * const manifest = await client.getAppManifest(
   *   'ed25519:abc123...',
   *   'my-wallet-app',
   *   '1.2.0'
   * );
   *
   * console.log(`App: ${manifest.app.name}`);
   * console.log(`Version: ${manifest.version.semver}`);
   * console.log(`Supported chains: ${manifest.supported_chains.join(', ')}`);
   *
   * // Check permissions
   * manifest.permissions.forEach(perm => {
   *   console.log(`Permission: ${perm.cap} (${perm.bytes} bytes)`);
   * });
   *
   * // List artifacts
   * manifest.artifacts.forEach(artifact => {
   *   console.log(`Artifact: ${artifact.type} -> ${artifact.cid}`);
   * });
   * ```
   *
   * @throws {ApiError} When the manifest is not found or request fails
   */
  async getAppManifest(
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<AppManifest> {
    const response = await this.api.get(`/apps/${pubkey}/${appName}/${semver}`);
    return response.data;
  }

  /**
   * Retrieves developer profile information.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @returns Promise resolving to the developer profile
   *
   * @example
   * ```typescript
   * const profile = await client.getDeveloper('ed25519:abc123...');
   *
   * console.log(`Developer: ${profile.display_name}`);
   * if (profile.website) {
   *   console.log(`Website: ${profile.website}`);
   * }
   *
   * // Check verification proofs
   * profile.proofs.forEach(proof => {
   *   const status = proof.verified ? '✅' : '❌';
   *   console.log(`${status} ${proof.type}: ${proof.value}`);
   * });
   * ```
   *
   * @throws {ApiError} When the developer is not found or request fails
   */
  async getDeveloper(pubkey: string): Promise<DeveloperProfile> {
    const response = await this.api.get(`/developers/${pubkey}`);
    return response.data;
  }

  /**
   * Retrieves attestation information for a specific application version.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @param appName - Name of the application
   * @param semver - Semantic version (e.g., '1.0.0', '2.1.3')
   * @returns Promise resolving to the attestation information
   *
   * @example
   * ```typescript
   * const attestation = await client.getAttestation(
   *   'ed25519:abc123...',
   *   'my-wallet-app',
   *   '1.2.0'
   * );
   *
   * console.log(`Status: ${attestation.status}`);
   * console.log(`Timestamp: ${attestation.timestamp}`);
   * if (attestation.comment) {
   *   console.log(`Comment: ${attestation.comment}`);
   * }
   *
   * // Check status
   * switch (attestation.status) {
   *   case 'ok':
   *     console.log('✅ Application is verified and safe');
   *     break;
   *   case 'yanked':
   *     console.log('⚠️  Application has been yanked');
   *     break;
   *   case 'tested':
   *     console.log('🧪 Application is in testing phase');
   *     break;
   * }
   * ```
   *
   * @throws {ApiError} When the attestation is not found or request fails
   */
  async getAttestation(
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<Attestation> {
    const response = await this.api.get(
      `/attestations/${pubkey}/${appName}/${semver}`
    );
    return response.data;
  }

  /**
   * Submits a new application manifest to the registry.
   *
   * @param manifest - Complete application manifest with signature
   * @returns Promise resolving to submission result
   *
   * @example
   * ```typescript
   * const manifest: AppManifest = {
   *   manifest_version: '1.0.0',
   *   app: {
   *     name: 'my-wallet-app',
   *     developer_pubkey: 'ed25519:abc123...',
   *     id: 'unique-app-id',
   *     alias: 'My Wallet',
   *   },
   *   version: {
   *     semver: '1.0.0',
   *   },
   *   supported_chains: ['mainnet', 'testnet'],
   *   permissions: [
   *     { cap: 'wallet', bytes: 1024 },
   *     { cap: 'network', bytes: 512 },
   *   ],
   *   artifacts: [
   *     {
   *       type: 'wasm',
   *       target: 'browser',
   *       cid: 'QmHash...',
   *       size: 1024000,
   *     },
   *   ],
   *   metadata: {
   *     description: 'A secure wallet application',
   *     author: 'John Doe',
   *   },
   *   distribution: 'ipfs',
   *   signature: {
   *     alg: 'ed25519',
   *     sig: 'signature...',
   *     signed_at: '2024-01-01T00:00:00Z',
   *   },
   * };
   *
   * const result = await client.submitAppManifest(manifest);
   *
   * if (result.success) {
   *   console.log('✅ Manifest submitted successfully');
   *   console.log(result.message);
   * } else {
   *   console.log('❌ Submission failed');
   *   console.log(result.message);
   * }
   * ```
   *
   * @throws {ApiError} When the submission fails (validation errors, etc.)
   */
  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post('/apps', manifest);
    return response.data;
  }

  /**
   * Submits or updates developer profile information.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @param profile - Developer profile information
   * @returns Promise resolving to submission result
   *
   * @example
   * ```typescript
   * const profile: DeveloperProfile = {
   *   display_name: 'John Doe',
   *   website: 'https://johndoe.dev',
   *   proofs: [
   *     {
   *       type: 'github',
   *       value: 'johndoe',
   *       verified: true,
   *     },
   *     {
   *       type: 'twitter',
   *       value: '@johndoe',
   *       verified: false,
   *     },
   *   ],
   * };
   *
   * const result = await client.submitDeveloperProfile(
   *   'ed25519:abc123...',
   *   profile
   * );
   *
   * if (result.success) {
   *   console.log('✅ Profile submitted successfully');
   * } else {
   *   console.log('❌ Submission failed:', result.message);
   * }
   * ```
   *
   * @throws {ApiError} When the submission fails (validation errors, etc.)
   */
  async submitDeveloperProfile(
    pubkey: string,
    profile: DeveloperProfile
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post('/developers', {
      pubkey,
      ...profile,
    });
    return response.data;
  }

  /**
   * Submits an attestation for a specific application version.
   *
   * @param pubkey - Developer's public key (Ed25519 format)
   * @param appName - Name of the application
   * @param semver - Semantic version (e.g., '1.0.0', '2.1.3')
   * @param attestation - Attestation information
   * @returns Promise resolving to submission result
   *
   * @example
   * ```typescript
   * const attestation: Attestation = {
   *   status: 'ok',
   *   comment: 'Passed security audit and functionality testing',
   *   timestamp: new Date().toISOString(),
   * };
   *
   * const result = await client.submitAttestation(
   *   'ed25519:abc123...',
   *   'my-wallet-app',
   *   '1.2.0',
   *   attestation
   * );
   *
   * if (result.success) {
   *   console.log('✅ Attestation submitted successfully');
   * } else {
   *   console.log('❌ Submission failed:', result.message);
   * }
   * ```
   *
   * @throws {ApiError} When the submission fails (validation errors, etc.)
   */
  async submitAttestation(
    pubkey: string,
    appName: string,
    semver: string,
    attestation: Attestation
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post(
      `/attestations/${pubkey}/${appName}/${semver}`,
      attestation
    );
    return response.data;
  }

  /**
   * Checks if the API is healthy and responding.
   *
   * @returns Promise resolving to health status
   *
   * @example
   * ```typescript
   * try {
   *   const health = await client.healthCheck();
   *   console.log(`API Status: ${health.status}`);
   *
   *   if (health.status === 'ok') {
   *     console.log('✅ API is healthy');
   *   } else {
   *     console.log('⚠️  API has issues');
   *   }
   * } catch (error) {
   *   console.log('❌ API is not responding');
   * }
   * ```
   *
   * @throws {ApiError} When the API is not responding
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await this.api.get('/healthz');
    return response.data;
  }

  /**
   * Retrieves certificate information for a developer.
   *
   * @param pubkey - Developer public key
   * @returns Promise resolving to certificate information
   *
   * @example
   * ```typescript
   * const certificate = await client.getCertificate('ed25519:abc123...');
   * console.log(certificate.whitelisted); // true or false
   * ```
   */
  async getCertificate(pubkey: string): Promise<{
    whitelisted: boolean;
    certificate?: {
      developer_pubkey: string;
      certificate_id: string;
      issued_at: string;
      expires_at: string;
      status: string;
      issuer: string;
    };
  }> {
    const response = await this.api.get(`/certificates/${pubkey}`);
    return response.data;
  }
}
