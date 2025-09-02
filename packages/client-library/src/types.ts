/**
 * Summary information for an application in the registry.
 *
 * @example
 * ```typescript
 * const appSummary: AppSummary = {
 *   name: 'my-wallet-app',
 *   developer_pubkey: 'ed25519:abc123...',
 *   latest_version: '1.2.0',
 *   latest_cid: 'QmHash...',
 *   alias: 'My Wallet App',
 * };
 * ```
 */
export interface AppSummary {
  /** The name of the application */
  name: string;
  /** Developer's public key in Ed25519 format */
  developer_pubkey: string;
  /** Latest semantic version of the application */
  latest_version: string;
  /** IPFS CID of the latest version */
  latest_cid: string;
  /** Optional human-readable alias for the application */
  alias?: string;
}

/**
 * Information about a specific version of an application.
 *
 * @example
 * ```typescript
 * const versionInfo: VersionInfo = {
 *   semver: '1.2.0',
 *   cid: 'QmHash...',
 *   yanked: false,
 * };
 * ```
 */
export interface VersionInfo {
  /** Semantic version (e.g., '1.0.0', '2.1.3') */
  semver: string;
  /** IPFS CID of the version artifacts */
  cid: string;
  /** Whether this version has been yanked (removed from distribution) */
  yanked?: boolean;
}

/**
 * Complete application manifest containing all metadata and artifacts.
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
 *       mirrors: ['https://gateway.pinata.cloud/ipfs/QmHash...'],
 *     },
 *   ],
 *   metadata: {
 *     description: 'A secure wallet application',
 *     author: 'John Doe',
 *     license: 'MIT',
 *   },
 *   distribution: 'ipfs',
 *   signature: {
 *     alg: 'ed25519',
 *     sig: 'signature...',
 *     signed_at: '2024-01-01T00:00:00Z',
 *   },
 * };
 * ```
 */
export interface AppManifest {
  /** Version of the manifest format */
  manifest_version: string;
  /** Application identification information */
  app: {
    /** The name of the application */
    name: string;
    /** Developer's public key in Ed25519 format */
    developer_pubkey: string;
    /** Unique identifier for the application */
    id: string;
    /** Optional human-readable alias */
    alias?: string;
  };
  /** Version information */
  version: {
    /** Semantic version (e.g., '1.0.0', '2.1.3') */
    semver: string;
  };
  /** List of supported blockchain networks */
  supported_chains: string[];
  /** Required permissions and their byte limits */
  permissions: {
    /** Permission capability (e.g., 'wallet', 'network', 'storage') */
    cap: string;
    /** Maximum bytes allowed for this permission */
    bytes: number;
  }[];
  /** Application artifacts (WASM files, etc.) */
  artifacts: {
    /** Type of artifact (e.g., 'wasm', 'html', 'js') */
    type: string;
    /** Target platform (e.g., 'browser', 'node') */
    target: string;
    /** IPFS CID of the artifact */
    cid: string;
    /** Size of the artifact in bytes */
    size: number;
    /** Optional mirror URLs for faster access */
    mirrors?: string[];
  }[];
  /** Additional metadata about the application */
  metadata: Record<string, unknown>;
  /** Distribution method (e.g., 'ipfs') */
  distribution: string;
  /** Cryptographic signature of the manifest */
  signature: {
    /** Signature algorithm (e.g., 'ed25519') */
    alg: string;
    /** The signature value */
    sig: string;
    /** ISO timestamp when the manifest was signed */
    signed_at: string;
  };
}

/**
 * Developer profile information including verification proofs.
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
 *     {
 *       type: 'email',
 *       value: 'john@example.com',
 *       verified: true,
 *     },
 *   ],
 * };
 * ```
 */
export interface DeveloperProfile {
  /** Human-readable display name */
  display_name: string;
  /** Optional website URL */
  website?: string;
  /** Verification proofs for the developer's identity */
  proofs: {
    /** Type of proof (e.g., 'github', 'twitter', 'email') */
    type: string;
    /** The proof value (username, email, etc.) */
    value: string;
    /** Whether this proof has been verified */
    verified: boolean;
  }[];
}

/**
 * Attestation information for an application version.
 *
 * @example
 * ```typescript
 * const attestation: Attestation = {
 *   status: 'ok',
 *   comment: 'Passed security audit and functionality testing',
 *   timestamp: '2024-01-01T00:00:00Z',
 * };
 * ```
 */
export interface Attestation {
  /** Status of the attestation */
  status: 'ok' | 'yanked' | 'tested';
  /** Optional comment about the attestation */
  comment?: string;
  /** ISO timestamp when the attestation was created */
  timestamp: string;
}

/**
 * Error information returned by the API.
 *
 * @example
 * ```typescript
 * const apiError: ApiError = {
 *   message: 'Application not found',
 *   code: 'NOT_FOUND',
 *   details: {
 *     pubkey: 'ed25519:abc123...',
 *     app_name: 'my-wallet-app',
 *   },
 * };
 * ```
 */
export interface ApiError {
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
  /** Optional additional error details */
  details?: Record<string, unknown>;
}

/**
 * Configuration options for the SSApp Registry client.
 *
 * @example
 * ```typescript
 * const config: ClientConfig = {
 *   baseURL: 'https://api.calimero.network',
 *   timeout: 30000,
 *   headers: {
 *     'Authorization': 'Bearer token',
 *     'User-Agent': 'MyApp/1.0.0',
 *   },
 * };
 * ```
 */
export interface ClientConfig {
  /** Base URL for the API (default: 'http://localhost:8082') */
  baseURL?: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Additional headers to include in all requests */
  headers?: Record<string, string>;
}
