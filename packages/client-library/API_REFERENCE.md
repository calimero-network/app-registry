# SSApp Registry Client Library - API Reference

This document provides a comprehensive reference for the SSApp Registry Client Library, including all public methods, types, and usage examples.

## 📦 Installation

```bash
npm install @calimero-network/registry-client
```

## 🚀 Quick Start

```typescript
import { SSAppRegistryClient } from '@calimero-network/registry-client';

const client = new SSAppRegistryClient({
  baseURL: 'https://api.calimero.network',
  timeout: 10000,
});
```

## 📚 Class Reference

### SSAppRegistryClient

The main client class for interacting with the SSApp Registry API.

#### Constructor

```typescript
new SSAppRegistryClient(config?: ClientConfig)
```

**Parameters:**

- `config` (optional): Configuration options for the client

**Configuration Options:**

- `baseURL`: Base URL for the API (default: 'http://localhost:8082')
- `timeout`: Request timeout in milliseconds (default: 10000)
- `headers`: Additional headers to include in requests

**Example:**

```typescript
// Basic configuration
const client = new SSAppRegistryClient();

// Custom configuration
const client = new SSAppRegistryClient({
  baseURL: 'https://api.calimero.network',
  timeout: 30000,
  headers: {
    Authorization: 'Bearer token',
  },
});
```

## 🔧 Methods

### getApps()

Retrieves a list of all applications with optional filtering.

```typescript
async getApps(params?: {
  dev?: string;
  name?: string;
}): Promise<AppSummary[]>
```

**Parameters:**

- `params` (optional): Filtering parameters
  - `dev`: Filter by developer public key
  - `name`: Filter by application name (partial match)

**Returns:** Promise resolving to an array of application summaries

**Example:**

```typescript
// Get all applications
const allApps = await client.getApps();

// Filter by developer
const devApps = await client.getApps({ dev: 'ed25519:abc123...' });

// Filter by name
const walletApps = await client.getApps({ name: 'wallet' });

// Filter by both
const filteredApps = await client.getApps({
  dev: 'ed25519:abc123...',
  name: 'wallet',
});
```

### getAppVersions()

Retrieves all versions of a specific application.

```typescript
async getAppVersions(
  pubkey: string,
  appName: string
): Promise<VersionInfo[]>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)
- `appName`: Name of the application

**Returns:** Promise resolving to an array of version information

**Example:**

```typescript
const versions = await client.getAppVersions('my-wallet-app');

versions.forEach(version => {
  console.log(`Version ${version.semver}: ${version.cid}`);
  if (version.yanked) {
    console.log('  ⚠️  This version has been yanked');
  }
});
```

### getAppManifest()

Retrieves the complete manifest for a specific application version.

```typescript
async getAppManifest(
  pubkey: string,
  appName: string,
  semver: string
): Promise<AppManifest>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)
- `appName`: Name of the application
- `semver`: Semantic version (e.g., '1.0.0', '2.1.3')

**Returns:** Promise resolving to the application manifest

**Example:**

```typescript
const manifest = await client.getAppManifest('my-wallet-app', '1.2.0');

console.log(`App: ${manifest.app.name}`);
console.log(`Version: ${manifest.version.semver}`);
console.log(`Supported chains: ${manifest.supported_chains.join(', ')}`);

// Check permissions
manifest.permissions.forEach(perm => {
  console.log(`Permission: ${perm.cap} (${perm.bytes} bytes)`);
});

// List artifacts
manifest.artifacts.forEach(artifact => {
  console.log(`Artifact: ${artifact.type} -> ${artifact.cid}`);
});
```

### getDeveloper()

Retrieves developer profile information.

```typescript
async getDeveloper(pubkey: string): Promise<DeveloperProfile>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)

**Returns:** Promise resolving to the developer profile

**Example:**

```typescript
const profile = await client.getDeveloper('ed25519:abc123...');

console.log(`Developer: ${profile.display_name}`);
if (profile.website) {
  console.log(`Website: ${profile.website}`);
}

// Check verification proofs
profile.proofs.forEach(proof => {
  const status = proof.verified ? '✅' : '❌';
  console.log(`${status} ${proof.type}: ${proof.value}`);
});
```

### getAttestation()

Retrieves attestation information for a specific application version.

```typescript
async getAttestation(
  pubkey: string,
  appName: string,
  semver: string
): Promise<Attestation>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)
- `appName`: Name of the application
- `semver`: Semantic version (e.g., '1.0.0', '2.1.3')

**Returns:** Promise resolving to the attestation information

**Example:**

```typescript
const attestation = await client.getAttestation(
  'ed25519:abc123...',
  'my-wallet-app',
  '1.2.0'
);

console.log(`Status: ${attestation.status}`);
console.log(`Timestamp: ${attestation.timestamp}`);
if (attestation.comment) {
  console.log(`Comment: ${attestation.comment}`);
}

// Check status
switch (attestation.status) {
  case 'ok':
    console.log('✅ Application is verified and safe');
    break;
  case 'yanked':
    console.log('⚠️  Application has been yanked');
    break;
  case 'tested':
    console.log('🧪 Application is in testing phase');
    break;
}
```

### submitAppManifest()

Submits a new application manifest to the registry.

```typescript
async submitAppManifest(
  manifest: AppManifest
): Promise<{ success: boolean; message: string }>
```

**Parameters:**

- `manifest`: Complete application manifest with signature

**Returns:** Promise resolving to submission result

**Example:**

```typescript
const manifest: AppManifest = {
  manifest_version: '1.0.0',
  app: {
    name: 'my-wallet-app',
    developer_pubkey: 'ed25519:abc123...',
    id: 'unique-app-id',
    alias: 'My Wallet',
  },
  version: {
    semver: '1.0.0',
  },
  supported_chains: ['mainnet', 'testnet'],
  permissions: [
    { cap: 'wallet', bytes: 1024 },
    { cap: 'network', bytes: 512 },
  ],
  artifacts: [
    {
      type: 'wasm',
      target: 'browser',
      cid: 'QmHash...',
      size: 1024000,
    },
  ],
  metadata: {
    description: 'A secure wallet application',
    author: 'John Doe',
  },
  distribution: 'ipfs',
  signature: {
    alg: 'ed25519',
    sig: 'signature...',
    signed_at: '2024-01-01T00:00:00Z',
  },
};

const result = await client.submitAppManifest(manifest);

if (result.success) {
  console.log('✅ Manifest submitted successfully');
  console.log(result.message);
} else {
  console.log('❌ Submission failed');
  console.log(result.message);
}
```

### submitDeveloperProfile()

Submits or updates developer profile information.

```typescript
async submitDeveloperProfile(
  pubkey: string,
  profile: DeveloperProfile
): Promise<{ success: boolean; message: string }>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)
- `profile`: Developer profile information

**Returns:** Promise resolving to submission result

**Example:**

```typescript
const profile: DeveloperProfile = {
  display_name: 'John Doe',
  website: 'https://johndoe.dev',
  proofs: [
    {
      type: 'github',
      value: 'johndoe',
      verified: true,
    },
    {
      type: 'twitter',
      value: '@johndoe',
      verified: false,
    },
  ],
};

const result = await client.submitDeveloperProfile(
  'ed25519:abc123...',
  profile
);

if (result.success) {
  console.log('✅ Profile submitted successfully');
} else {
  console.log('❌ Submission failed:', result.message);
}
```

### submitAttestation()

Submits an attestation for a specific application version.

```typescript
async submitAttestation(
  pubkey: string,
  appName: string,
  semver: string,
  attestation: Attestation
): Promise<{ success: boolean; message: string }>
```

**Parameters:**

- `pubkey`: Developer's public key (Ed25519 format)
- `appName`: Name of the application
- `semver`: Semantic version (e.g., '1.0.0', '2.1.3')
- `attestation`: Attestation information

**Returns:** Promise resolving to submission result

**Example:**

```typescript
const attestation: Attestation = {
  status: 'ok',
  comment: 'Passed security audit and functionality testing',
  timestamp: new Date().toISOString(),
};

const result = await client.submitAttestation(
  'ed25519:abc123...',
  'my-wallet-app',
  '1.2.0',
  attestation
);

if (result.success) {
  console.log('✅ Attestation submitted successfully');
} else {
  console.log('❌ Submission failed:', result.message);
}
```

### healthCheck()

Checks if the API is healthy and responding.

```typescript
async healthCheck(): Promise<{ status: string }>
```

**Returns:** Promise resolving to health status

**Example:**

```typescript
try {
  const health = await client.healthCheck();
  console.log(`API Status: ${health.status}`);

  if (health.status === 'ok') {
    console.log('✅ API is healthy');
  } else {
    console.log('⚠️  API has issues');
  }
} catch (error) {
  console.log('❌ API is not responding');
}
```

## 📊 Type Definitions

### AppSummary

Summary information for an application in the registry.

```typescript
interface AppSummary {
  name: string; // The name of the application
  developer_pubkey: string; // Developer's public key in Ed25519 format
  latest_version: string; // Latest semantic version of the application
  latest_cid: string; // IPFS CID of the latest version
  alias?: string; // Optional human-readable alias for the application
}
```

**Example:**

```typescript
const appSummary: AppSummary = {
  name: 'my-wallet-app',
  developer_pubkey: 'ed25519:abc123...',
  latest_version: '1.2.0',
  latest_cid: 'QmHash...',
  alias: 'My Wallet App',
};
```

### VersionInfo

Information about a specific version of an application.

```typescript
interface VersionInfo {
  semver: string; // Semantic version (e.g., '1.0.0', '2.1.3')
  cid: string; // IPFS CID of the version artifacts
  yanked?: boolean; // Whether this version has been yanked
}
```

**Example:**

```typescript
const versionInfo: VersionInfo = {
  semver: '1.2.0',
  cid: 'QmHash...',
  yanked: false,
};
```

### AppManifest

Complete application manifest containing all metadata and artifacts.

```typescript
interface AppManifest {
  manifest_version: string; // Version of the manifest format
  app: {
    name: string; // The name of the application
    developer_pubkey: string; // Developer's public key in Ed25519 format
    id: string; // Unique identifier for the application
    alias?: string; // Optional human-readable alias
  };
  version: {
    semver: string; // Semantic version (e.g., '1.0.0', '2.1.3')
  };
  supported_chains: string[]; // List of supported blockchain networks
  permissions: {
    cap: string; // Permission capability (e.g., 'wallet', 'network', 'storage')
    bytes: number; // Maximum bytes allowed for this permission
  }[];
  artifacts: {
    type: string; // Type of artifact (e.g., 'wasm', 'html', 'js')
    target: string; // Target platform (e.g., 'browser', 'node')
    cid: string; // IPFS CID of the artifact
    size: number; // Size of the artifact in bytes
    mirrors?: string[]; // Optional mirror URLs for faster access
  }[];
  metadata: Record<string, unknown>; // Additional metadata about the application
  distribution: string; // Distribution method (e.g., 'ipfs')
  signature: {
    alg: string; // Signature algorithm (e.g., 'ed25519')
    sig: string; // The signature value
    signed_at: string; // ISO timestamp when the manifest was signed
  };
}
```

**Example:**

```typescript
const manifest: AppManifest = {
  manifest_version: '1.0.0',
  app: {
    name: 'my-wallet-app',
    developer_pubkey: 'ed25519:abc123...',
    id: 'unique-app-id',
    alias: 'My Wallet',
  },
  version: {
    semver: '1.0.0',
  },
  supported_chains: ['mainnet', 'testnet'],
  permissions: [
    { cap: 'wallet', bytes: 1024 },
    { cap: 'network', bytes: 512 },
  ],
  artifacts: [
    {
      type: 'wasm',
      target: 'browser',
      cid: 'QmHash...',
      size: 1024000,
      mirrors: ['https://gateway.pinata.cloud/ipfs/QmHash...'],
    },
  ],
  metadata: {
    description: 'A secure wallet application',
    author: 'John Doe',
    license: 'MIT',
  },
  distribution: 'ipfs',
  signature: {
    alg: 'ed25519',
    sig: 'signature...',
    signed_at: '2024-01-01T00:00:00Z',
  },
};
```

### DeveloperProfile

Developer profile information including verification proofs.

```typescript
interface DeveloperProfile {
  display_name: string; // Human-readable display name
  website?: string; // Optional website URL
  proofs: {
    type: string; // Type of proof (e.g., 'github', 'twitter', 'email')
    value: string; // The proof value (username, email, etc.)
    verified: boolean; // Whether this proof has been verified
  }[];
}
```

**Example:**

```typescript
const profile: DeveloperProfile = {
  display_name: 'John Doe',
  website: 'https://johndoe.dev',
  proofs: [
    {
      type: 'github',
      value: 'johndoe',
      verified: true,
    },
    {
      type: 'twitter',
      value: '@johndoe',
      verified: false,
    },
    {
      type: 'email',
      value: 'john@example.com',
      verified: true,
    },
  ],
};
```

### Attestation

Attestation information for an application version.

```typescript
interface Attestation {
  status: 'ok' | 'yanked' | 'tested'; // Status of the attestation
  comment?: string; // Optional comment about the attestation
  timestamp: string; // ISO timestamp when the attestation was created
}
```

**Example:**

```typescript
const attestation: Attestation = {
  status: 'ok',
  comment: 'Passed security audit and functionality testing',
  timestamp: '2024-01-01T00:00:00Z',
};
```

### ApiError

Error information returned by the API.

```typescript
interface ApiError {
  message: string; // Human-readable error message
  code?: string; // Optional error code for programmatic handling
  details?: Record<string, unknown>; // Optional additional error details
}
```

**Example:**

```typescript
const apiError: ApiError = {
  message: 'Application not found',
  code: 'NOT_FOUND',
  details: {
    pubkey: 'ed25519:abc123...',
    app_name: 'my-wallet-app',
  },
};
```

### ClientConfig

Configuration options for the SSApp Registry client.

```typescript
interface ClientConfig {
  baseURL?: string; // Base URL for the API (default: 'http://localhost:8082')
  timeout?: number; // Request timeout in milliseconds (default: 10000)
  headers?: Record<string, string>; // Additional headers to include in all requests
}
```

**Example:**

```typescript
const config: ClientConfig = {
  baseURL: 'https://api.calimero.network',
  timeout: 30000,
  headers: {
    Authorization: 'Bearer token',
    'User-Agent': 'MyApp/1.0.0',
  },
};
```

## 🎯 Complete Example

Here's a complete example showing how to use the client library:

```typescript
import { SSAppRegistryClient } from '@calimero-network/registry-client';

async function main() {
  // Create client
  const client = new SSAppRegistryClient({
    baseURL: 'https://api.calimero.network',
    timeout: 10000,
  });

  try {
    // Check API health
    const health = await client.healthCheck();
    console.log(`API Status: ${health.status}`);

    // Get all applications
    const apps = await client.getApps();
    console.log(`Found ${apps.length} applications`);

    // Get specific app versions
    if (apps.length > 0) {
      const firstApp = apps[0];
      const versions = await client.getAppVersions(
        firstApp.developer_pubkey,
        firstApp.name
      );
      console.log(`Found ${versions.length} versions for ${firstApp.name}`);

      // Get manifest for latest version
      if (versions.length > 0) {
        const latestVersion = versions[0];
        const manifest = await client.getAppManifest(
          firstApp.developer_pubkey,
          firstApp.name,
          latestVersion.semver
        );
        console.log(
          `Manifest for ${manifest.app.name} v${manifest.version.semver}`
        );

        // Get developer profile
        const developer = await client.getDeveloper(firstApp.developer_pubkey);
        console.log(`Developer: ${developer.display_name}`);

        // Get attestation
        const attestation = await client.getAttestation(
          firstApp.developer_pubkey,
          firstApp.name,
          latestVersion.semver
        );
        console.log(`Attestation status: ${attestation.status}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## 🚨 Error Handling

All methods can throw an `ApiError` when the API request fails. Here's how to handle errors:

```typescript
try {
  const apps = await client.getApps();
  console.log('Success:', apps);
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    console.log('Resource not found');
  } else if (error.code === 'VALIDATION_ERROR') {
    console.log('Validation failed:', error.details);
  } else {
    console.log('Unexpected error:', error.message);
  }
}
```

## 📝 Notes

- All public keys should be in Ed25519 format (e.g., `ed25519:abc123...`)
- Semantic versions should follow the standard format (e.g., `1.0.0`, `2.1.3`)
- IPFS CIDs should be valid multihash format
- All timestamps should be in ISO 8601 format
- The client automatically handles request/response serialization and error mapping
