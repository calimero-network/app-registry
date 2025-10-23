# Registry Integration Guide

This guide explains how to integrate the Calimero Network App Registry with different registry systems and environments.

## 🏗️ Architecture Overview

The registry system is designed with a modular architecture that supports multiple integration patterns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Client    │    │  Local Registry │    │ Remote Registry │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │RegistryClient│ │◄──►│ │LocalServer  │ │    │ │Remote API   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │ ┌─────────────┐ │    │                 │
│ ┌─────────────┐ │    │ │LocalStorage │ │    │ ┌─────────────┐ │
│ │Commands     │ │    │ └─────────────┘ │    │ │Database     │ │
│ └─────────────┘ │    │ ┌─────────────┐ │    │ └─────────────┘ │
└─────────────────┘    │ │ArtifactSrvr │ │    │                 │
                       │ └─────────────┘ │    │                 │
                       └─────────────────┘    └─────────────────┘
```

## 🔌 Integration Patterns

### 1. Local Development Integration

**Use Case**: Offline development, testing, and prototyping

**Components**:

- `LocalRegistryServer`: Fastify-based HTTP server
- `LocalDataStore`: JSON file-based persistence
- `LocalArtifactServer`: Local file serving
- `LocalConfig`: Configuration management

**Integration Steps**:

1. **Start Local Registry**:

   ```bash
   calimero-registry local start --port 8082
   ```

2. **Use with CLI Commands**:

   ```bash
   # All existing commands work with --local flag
   calimero-registry apps list --local
   calimero-registry apps submit manifest.json --local
   calimero-registry health --local
   ```

3. **Programmatic Integration**:

   ```typescript
   import { LocalRegistryServer } from './lib/local-server.js';
   import { LocalConfig } from './lib/local-config.js';

   const config = new LocalConfig();
   const server = new LocalRegistryServer(config);

   // Start server
   await server.start();

   // Use with existing client
   const client = createRegistryClient(true); // true = local
   const apps = await client.getApps();
   ```

### 2. Remote Registry Integration

**Use Case**: Production deployments, team collaboration

**Components**:

- Remote API server (Fastify-based)
- Database persistence (PostgreSQL, MongoDB, etc.)
- IPFS for artifact storage
- Authentication and authorization

**Integration Steps**:

1. **Configure Remote Client**:

   ```typescript
   import { SSAppRegistryClient } from '@calimero-network/registry-client';

   const client = new SSAppRegistryClient({
     baseURL: 'https://registry.example.com',
     timeout: 10000,
   });
   ```

2. **Use Standard Commands**:
   ```bash
   # Default behavior uses remote registry
   calimero-registry apps list
   calimero-registry apps submit manifest.json
   calimero-registry health
   ```

### 3. Hybrid Integration

**Use Case**: Development with production data, staging environments

**Components**:

- Local registry for development
- Remote registry for production
- Data synchronization between environments

**Integration Steps**:

1. **Environment-Specific Configuration**:

   ```typescript
   const useLocal = process.env.NODE_ENV === 'development';
   const client = createRegistryClient(useLocal);
   ```

2. **Data Migration**:

   ```bash
   # Export from local registry
   calimero-registry local backup local-data.json

   # Import to remote registry (via API)
   curl -X POST https://registry.example.com/import \
     -H "Content-Type: application/json" \
     -d @local-data.json
   ```

## 🛠️ Implementation Guide

### Step 1: Understand the Registry Interface

The registry system uses a unified interface that works with both local and remote implementations:

```typescript
interface RegistryClient {
  // App management
  getApps(filters?: { dev?: string; name?: string }): Promise<AppSummary[]>;
  getAppVersions(appId: string): Promise<VersionInfo[]>;
  getAppManifest(appId: string, semver: string): Promise<AppManifest>;
  submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }>;

  // Health and status
  healthCheck(): Promise<{ status: string }>;
}
```

### Step 2: Choose Your Integration Pattern

#### Pattern A: Local-First Development

```typescript
// Always use local registry for development
const client = createRegistryClient(true);
```

#### Pattern B: Environment-Based Switching

```typescript
// Switch based on environment
const isLocal = process.env.REGISTRY_TYPE === 'local';
const client = createRegistryClient(isLocal);
```

#### Pattern C: Configuration-Driven

```typescript
// Use configuration file to determine registry type
const config = loadConfig();
const client = createRegistryClient(config.useLocal);
```

### Step 3: Implement Registry-Specific Logic

#### For Local Registry Integration:

1. **Data Storage**:

   ```typescript
   // Local registry uses JSON files
   const dataStore = new LocalDataStore(config);
   await dataStore.setApp('app-id', appData);
   ```

2. **Artifact Handling**:

   ```typescript
   // Local artifacts are served via HTTP
   const artifactServer = new LocalArtifactServer(config, dataStore);
   await artifactServer.copyArtifactToLocal(
     sourcePath,
     appId,
     version,
     filename
   );
   ```

3. **Configuration**:
   ```typescript
   // Local registry configuration
   const config = new LocalConfig();
   config.setPort(8082);
   config.setDataDir('/path/to/data');
   ```

#### For Remote Registry Integration:

1. **API Client**:

   ```typescript
   // Remote registry uses HTTP API
   const client = new SSAppRegistryClient({
     baseURL: 'https://registry.example.com',
     timeout: 10000,
   });
   ```

2. **Authentication**:

   ```typescript
   // Add authentication headers
   client.setAuthToken('your-auth-token');
   ```

3. **Error Handling**:
   ```typescript
   try {
     const apps = await client.getApps();
   } catch (error) {
     if (error.status === 401) {
       // Handle authentication error
     }
   }
   ```

### Step 4: Handle Data Synchronization

#### Local to Remote Migration:

```typescript
async function migrateLocalToRemote(
  localData: LocalData,
  remoteClient: SSAppRegistryClient
) {
  // Export local data
  const localApps = await localDataStore.getApps();

  // Submit to remote registry
  for (const app of localApps) {
    await remoteClient.submitAppManifest(app.manifest);
  }
}
```

#### Remote to Local Import:

```typescript
async function importRemoteToLocal(
  remoteClient: SSAppRegistryClient,
  localDataStore: LocalDataStore
) {
  // Fetch from remote registry
  const remoteApps = await remoteClient.getApps();

  // Store locally
  for (const app of remoteApps) {
    await localDataStore.setApp(app.id, app);
  }
}
```

## 🔧 Custom Registry Integration

### Creating a Custom Registry Implementation

1. **Implement the RegistryClient Interface**:

   ```typescript
   class CustomRegistryClient implements RegistryClient {
     async getApps(filters?: {
       dev?: string;
       name?: string;
     }): Promise<AppSummary[]> {
       // Your custom implementation
     }

     async getAppVersions(appId: string): Promise<VersionInfo[]> {
       // Your custom implementation
     }

     // ... implement other methods
   }
   ```

2. **Register with the CLI**:

   ```typescript
   // In your CLI initialization
   const customClient = new CustomRegistryClient();
   registerRegistryClient('custom', customClient);
   ```

3. **Use in Commands**:
   ```bash
   calimero-registry apps list --registry custom
   ```

### Integration with External Systems

#### IPFS Integration:

```typescript
class IPFSRegistryClient implements RegistryClient {
  private ipfs: IPFS;

  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    // Upload artifacts to IPFS
    const artifactCid = await this.ipfs.add(artifactBuffer);

    // Update manifest with IPFS CID
    manifest.artifacts[0].cid = artifactCid;

    // Submit to registry
    return await this.submitToRegistry(manifest);
  }
}
```

#### Database Integration:

```typescript
class DatabaseRegistryClient implements RegistryClient {
  private db: Database;

  async getApps(filters?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    let query = this.db.select().from('apps');

    if (filters?.dev) {
      query = query.where('developer_pubkey', filters.dev);
    }

    return await query.execute();
  }
}
```

## 📋 Integration Checklist

### For Local Registry Integration:

- [ ] Install required dependencies (`fastify`, `@fastify/cors`)
- [ ] Configure data directory and port
- [ ] Implement artifact copying logic
- [ ] Set up backup/restore functionality
- [ ] Add health check endpoints
- [ ] Test with sample data

### For Remote Registry Integration:

- [ ] Set up API server with proper authentication
- [ ] Configure database connection
- [ ] Implement IPFS integration for artifacts
- [ ] Add rate limiting and security measures
- [ ] Set up monitoring and logging
- [ ] Test with production data

### For Hybrid Integration:

- [ ] Implement environment detection
- [ ] Add data synchronization logic
- [ ] Configure different endpoints per environment
- [ ] Set up migration scripts
- [ ] Add conflict resolution
- [ ] Test data consistency

## 🚀 Best Practices

### 1. Environment Configuration

```typescript
const config = {
  development: {
    registry: 'local',
    port: 8082,
    dataDir: './dev-data',
  },
  staging: {
    registry: 'remote',
    baseURL: 'https://staging-registry.example.com',
  },
  production: {
    registry: 'remote',
    baseURL: 'https://registry.example.com',
  },
};
```

### 2. Error Handling

```typescript
try {
  const result = await client.getApps();
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // Handle connection errors
  } else if (error.status === 404) {
    // Handle not found errors
  } else {
    // Handle other errors
  }
}
```

### 3. Data Validation

```typescript
// Validate manifest before submission
const manifestSchema = require('./schemas/manifest.js');
const isValid = manifestSchema.validate(manifest);
if (!isValid) {
  throw new Error('Invalid manifest structure');
}
```

### 4. Performance Optimization

```typescript
// Cache frequently accessed data
const cache = new Map();
const getCachedApps = async () => {
  if (cache.has('apps')) {
    return cache.get('apps');
  }
  const apps = await client.getApps();
  cache.set('apps', apps);
  return apps;
};
```

## 🔍 Troubleshooting

### Common Issues:

1. **Port Already in Use**:

   ```bash
   # Use different port
   calimero-registry local start --port 8083
   ```

2. **Data Directory Permissions**:

   ```bash
   # Fix permissions
   chmod 755 ~/.calimero-registry/data
   ```

3. **Artifact Copying Failures**:

   ```typescript
   // Check file permissions and paths
   if (!fs.existsSync(artifactPath)) {
     throw new Error(`Artifact not found: ${artifactPath}`);
   }
   ```

4. **Network Connectivity**:
   ```typescript
   // Add retry logic for network requests
   const retryRequest = async (fn, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000 * i));
       }
     }
   };
   ```

## 📚 Additional Resources

- [Local Registry Documentation](./packages/cli/LOCAL_REGISTRY.md)
- [CLI Usage Guide](./packages/cli/README.md)
- [API Documentation](./packages/backend/README.md)
- [Client Library Reference](./packages/client-library/README.md)

## 🤝 Contributing

To contribute to registry integration improvements:

1. Fork the repository
2. Create a feature branch
3. Implement your integration
4. Add tests and documentation
5. Submit a pull request

For questions or support, please open an issue in the repository.
