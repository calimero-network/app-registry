# Registry Integration Example

This example demonstrates how to integrate the Calimero Network App Registry with different systems and environments.

## Example 1: Local Development Setup

### Scenario

A development team wants to work offline with a local registry for testing and development.

### Implementation

```typescript
// 1. Start local registry
import { LocalRegistryServer } from './lib/local-server.js';
import { LocalConfig } from './lib/local-config.js';

const config = new LocalConfig();
const server = new LocalRegistryServer(config);

// Start server
await server.start();
console.log('Local registry started on http://localhost:8082');

// 2. Use with CLI commands
// All commands work with --local flag
// calimero-registry apps list --local
// calimero-registry apps submit manifest.json --local

// 3. Programmatic usage
import { createRegistryClient } from './lib/registry-client.js';

const client = createRegistryClient(true); // true = local
const apps = await client.getApps();
console.log('Local apps:', apps);
```

### CLI Usage

```bash
# Start local registry
calimero-registry local start

# Seed with sample data
calimero-registry local seed

# List apps from local registry
calimero-registry apps list --local

# Submit new app to local registry
calimero-registry apps submit my-app.json --local

# Check local registry health
calimero-registry health --local
```

## Example 2: Production Deployment

### Scenario

A production application needs to use a remote registry with authentication.

### Implementation

```typescript
// 1. Configure remote client
import { SSAppRegistryClient } from '@calimero-network/registry-client';

const client = new SSAppRegistryClient({
  baseURL: 'https://registry.example.com',
  timeout: 10000,
});

// 2. Add authentication
client.setAuthToken('your-production-token');

// 3. Use standard commands (no --local flag)
// calimero-registry apps list
// calimero-registry apps submit manifest.json

// 4. Programmatic usage
try {
  const apps = await client.getApps();
  console.log('Production apps:', apps);
} catch (error) {
  if (error.status === 401) {
    console.log('Authentication required');
  } else if (error.status === 403) {
    console.log('Insufficient permissions');
  }
}
```

### CLI Usage

```bash
# Use remote registry (default)
calimero-registry apps list
calimero-registry apps submit my-app.json
calimero-registry health
```

## Example 3: Hybrid Environment

### Scenario

An application needs to switch between local development and remote production based on environment.

### Implementation

```typescript
// 1. Environment detection
const isLocal = process.env.NODE_ENV === 'development';
const client = createRegistryClient(isLocal);

// 2. Environment-specific configuration
const config = {
  development: {
    registry: 'local',
    port: 8082,
    dataDir: './dev-data',
  },
  production: {
    registry: 'remote',
    baseURL: 'https://registry.example.com',
  },
};

// 3. Use appropriate registry
if (isLocal) {
  console.log('Using local registry for development');
  // Local registry operations
} else {
  console.log('Using remote registry for production');
  // Remote registry operations
}
```

### CLI Usage

```bash
# Development (uses local registry)
NODE_ENV=development calimero-registry apps list

# Production (uses remote registry)
NODE_ENV=production calimero-registry apps list

# Manual override
calimero-registry apps list --local    # Force local
calimero-registry apps list            # Use default (remote)
```

## Example 4: Data Migration

### Scenario

Migrating data from local development to remote production.

### Implementation

```typescript
// 1. Export from local registry
import { LocalDataStore } from './lib/local-storage.js';

const localDataStore = new LocalDataStore(config);
const localApps = await localDataStore.getApps();

// 2. Transform data for remote registry
const transformedApps = localApps.map(app => ({
  ...app,
  // Transform local paths to remote URLs
  artifacts: app.artifacts.map(artifact => ({
    ...artifact,
    url: `https://registry.example.com/artifacts/${artifact.hash}`,
  })),
}));

// 3. Submit to remote registry
const remoteClient = new SSAppRegistryClient({
  baseURL: 'https://registry.example.com',
});

for (const app of transformedApps) {
  await remoteClient.submitAppManifest(app.manifest);
}
```

### CLI Usage

```bash
# Export local data
calimero-registry local backup local-data.json

# Import to remote registry (via API)
curl -X POST https://registry.example.com/import \
  -H "Content-Type: application/json" \
  -d @local-data.json
```

## Example 5: Custom Registry Integration

### Scenario

Integrating with a custom registry system (e.g., IPFS-based).

### Implementation

```typescript
// 1. Implement custom registry client
class IPFSRegistryClient implements RegistryClient {
  private ipfs: IPFS;

  async getApps(filters?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    // Custom implementation for IPFS-based registry
    const apps = await this.ipfs.cat('registry/apps.json');
    return JSON.parse(apps.toString());
  }

  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    // Upload artifacts to IPFS
    const artifactCid = await this.ipfs.add(manifest.artifacts[0].buffer);

    // Update manifest with IPFS CID
    manifest.artifacts[0].cid = artifactCid;

    // Submit to IPFS registry
    const manifestCid = await this.ipfs.add(JSON.stringify(manifest));

    return {
      success: true,
      message: `App submitted to IPFS with CID: ${manifestCid}`,
    };
  }

  // Implement other required methods...
}

// 2. Register custom client
registerRegistryClient('ipfs', new IPFSRegistryClient());

// 3. Use with CLI
// calimero-registry apps list --registry ipfs
```

## Example 6: Error Handling and Retry Logic

### Scenario

Implementing robust error handling for network operations.

### Implementation

```typescript
// 1. Retry logic for network requests
const retryRequest = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
};

// 2. Error handling for different scenarios
try {
  const apps = await retryRequest(() => client.getApps());
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.log('Registry not available. Please check connection.');
  } else if (error.status === 401) {
    console.log('Authentication required. Please login first.');
  } else if (error.status === 403) {
    console.log('Insufficient permissions.');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Example 7: Performance Optimization

### Scenario

Optimizing registry operations for better performance.

### Implementation

```typescript
// 1. Caching for frequently accessed data
const cache = new Map();
const getCachedApps = async () => {
  if (cache.has('apps')) {
    return cache.get('apps');
  }

  const apps = await client.getApps();
  cache.set('apps', apps);
  return apps;
};

// 2. Batch operations for multiple submissions
const submitMultipleApps = async (manifests: AppManifest[]) => {
  const results = await Promise.allSettled(
    manifests.map(manifest => client.submitAppManifest(manifest))
  );

  return results.map((result, index) => ({
    manifest: manifests[index],
    success: result.status === 'fulfilled',
    error: result.status === 'rejected' ? result.reason : null,
  }));
};

// 3. Parallel operations
const [apps, health] = await Promise.all([
  client.getApps(),
  client.healthCheck(),
]);
```

## Example 8: Testing Integration

### Scenario

Testing registry integration with different scenarios.

### Implementation

```typescript
// 1. Mock registry for testing
class MockRegistryClient implements RegistryClient {
  private apps: AppSummary[] = [];

  async getApps(): Promise<AppSummary[]> {
    return this.apps;
  }

  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    this.apps.push({
      name: manifest.app.name,
      developer_pubkey: manifest.app.developer_pubkey,
      latest_version: manifest.version.semver,
      latest_cid: 'mock-cid',
      alias: manifest.app.alias,
    });

    return { success: true, message: 'App submitted to mock registry' };
  }

  // Implement other methods...
}

// 2. Test with mock registry
const mockClient = new MockRegistryClient();
const testManifest = {
  app: { name: 'test-app', developer_pubkey: 'ed25519:test' },
  version: { semver: '1.0.0' },
  // ... other manifest fields
};

const result = await mockClient.submitAppManifest(testManifest);
console.log('Test result:', result);

const apps = await mockClient.getApps();
console.log('Mock apps:', apps);
```

## Key Takeaways

1. **Unified Interface**: All registry implementations use the same interface
2. **Environment Detection**: Automatically switch between local and remote
3. **Data Consistency**: Same data structure across all implementations
4. **Seamless Integration**: Existing CLI commands work with both registries
5. **Flexible Configuration**: Support for multiple environments and use cases
6. **Error Handling**: Robust error handling for different scenarios
7. **Performance**: Optimization techniques for better performance
8. **Testing**: Mock implementations for testing integration

These examples demonstrate the flexibility and power of the registry system, allowing you to integrate with different environments and use cases seamlessly.
