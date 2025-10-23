# AI Integration Prompt for Registry Systems

## Context

You are working with the Calimero Network App Registry, a modular registry system that supports both local development and remote production environments. The system is designed with a unified interface that allows seamless switching between different registry implementations.

## Architecture Overview

The registry system follows a **unified client pattern** where:

1. **RegistryClient Interface**: All registry implementations (local, remote, custom) implement the same interface
2. **Environment Detection**: The system automatically detects whether to use local or remote registry
3. **Seamless Switching**: Users can switch between registries using the `--local` flag or configuration
4. **Data Consistency**: Both local and remote registries maintain the same data structure

## Key Components

### 1. RegistryClient Interface

```typescript
interface RegistryClient {
  getApps(filters?: { dev?: string; name?: string }): Promise<AppSummary[]>;
  getAppVersions(appId: string): Promise<VersionInfo[]>;
  getAppManifest(appId: string, semver: string): Promise<AppManifest>;
  submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }>;
  healthCheck(): Promise<{ status: string }>;
}
```

### 2. Local Registry Implementation

- **LocalRegistryServer**: Fastify-based HTTP server
- **LocalDataStore**: JSON file-based persistence
- **LocalArtifactServer**: Local file serving (replaces IPFS)
- **LocalConfig**: Configuration management

### 3. Remote Registry Implementation

- **SSAppRegistryClient**: HTTP client for remote API
- **Database persistence**: PostgreSQL, MongoDB, etc.
- **IPFS integration**: For artifact storage
- **Authentication**: JWT tokens, API keys

## Integration Patterns

### Pattern 1: Local-First Development

```typescript
// Always use local registry for development
const client = createRegistryClient(true); // true = local
```

### Pattern 2: Environment-Based Switching

```typescript
// Switch based on environment variables
const isLocal = process.env.NODE_ENV === 'development';
const client = createRegistryClient(isLocal);
```

### Pattern 3: Configuration-Driven

```typescript
// Use configuration file to determine registry type
const config = loadConfig();
const client = createRegistryClient(config.useLocal);
```

## When to Use Each Pattern

### Use Local Registry When:

- **Development**: Testing new features without affecting production
- **Offline Work**: No internet connection required
- **Fast Iteration**: No network delays
- **Data Isolation**: Safe experimentation
- **Team Collaboration**: Share local registry configurations

### Use Remote Registry When:

- **Production**: Live application deployment
- **Team Sharing**: Multiple developers accessing same data
- **Persistence**: Long-term data storage
- **Scalability**: Handle multiple concurrent users
- **Security**: Production-grade authentication and authorization

## Implementation Steps

### Step 1: Choose Your Integration Pattern

Based on your use case, determine whether you need:

- Local registry only
- Remote registry only
- Hybrid (both local and remote)

### Step 2: Implement Registry-Specific Logic

#### For Local Registry:

```typescript
// 1. Create local registry server
const config = new LocalConfig();
const server = new LocalRegistryServer(config);
await server.start();

// 2. Use with CLI commands
// All commands automatically work with --local flag
// calimero-registry apps list --local
// calimero-registry apps submit manifest.json --local

// 3. Programmatic usage
const client = createRegistryClient(true);
const apps = await client.getApps();
```

#### For Remote Registry:

```typescript
// 1. Configure remote client
const client = new SSAppRegistryClient({
  baseURL: 'https://registry.example.com',
  timeout: 10000,
});

// 2. Use standard commands (no --local flag)
// calimero-registry apps list
// calimero-registry apps submit manifest.json

// 3. Add authentication if needed
client.setAuthToken('your-auth-token');
```

#### For Hybrid Integration:

```typescript
// 1. Environment detection
const useLocal = process.env.REGISTRY_TYPE === 'local';
const client = createRegistryClient(useLocal);

// 2. Data synchronization
if (useLocal) {
  // Use local registry
  await localDataStore.setApp(appId, appData);
} else {
  // Use remote registry
  await remoteClient.submitAppManifest(manifest);
}
```

### Step 3: Handle Data Synchronization

#### Local to Remote Migration:

```typescript
async function migrateLocalToRemote() {
  // 1. Export local data
  const localApps = await localDataStore.getApps();

  // 2. Submit to remote registry
  for (const app of localApps) {
    await remoteClient.submitAppManifest(app.manifest);
  }
}
```

#### Remote to Local Import:

```typescript
async function importRemoteToLocal() {
  // 1. Fetch from remote registry
  const remoteApps = await remoteClient.getApps();

  // 2. Store locally
  for (const app of remoteApps) {
    await localDataStore.setApp(app.id, app);
  }
}
```

## Common Integration Scenarios

### Scenario 1: Development Team Setup

```bash
# Each developer runs local registry
calimero-registry local start
calimero-registry local seed  # Populate with sample data

# Use local registry for development
calimero-registry apps list --local
calimero-registry apps submit my-app.json --local
```

### Scenario 2: Production Deployment

```bash
# Use remote registry for production
calimero-registry apps list
calimero-registry apps submit my-app.json
```

### Scenario 3: Staging Environment

```bash
# Use remote registry with staging URL
calimero-registry apps list --url https://staging-registry.example.com
calimero-registry apps submit my-app.json --url https://staging-registry.example.com
```

### Scenario 4: Data Migration

```bash
# Export from local registry
calimero-registry local backup my-data.json

# Import to remote registry (via API)
curl -X POST https://registry.example.com/import \
  -H "Content-Type: application/json" \
  -d @my-data.json
```

## Error Handling Patterns

### Connection Errors:

```typescript
try {
  const apps = await client.getApps();
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // Handle connection refused (local registry not running)
    console.log(
      'Local registry not running. Start it with: calimero-registry local start'
    );
  } else if (error.status === 404) {
    // Handle not found errors
    console.log('App not found');
  } else {
    // Handle other errors
    console.error('Unexpected error:', error.message);
  }
}
```

### Authentication Errors:

```typescript
try {
  const result = await client.submitAppManifest(manifest);
} catch (error) {
  if (error.status === 401) {
    // Handle authentication error
    console.log('Authentication required. Please login first.');
  } else if (error.status === 403) {
    // Handle authorization error
    console.log('Insufficient permissions.');
  }
}
```

## Best Practices

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

### 2. Data Validation

```typescript
// Always validate manifests before submission
const manifestSchema = require('./schemas/manifest.js');
const isValid = manifestSchema.validate(manifest);
if (!isValid) {
  throw new Error('Invalid manifest structure');
}
```

### 3. Performance Optimization

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

## Troubleshooting Guide

### Common Issues and Solutions:

1. **Port Already in Use**:

   ```bash
   # Solution: Use different port
   calimero-registry local start --port 8083
   ```

2. **Data Directory Permissions**:

   ```bash
   # Solution: Fix permissions
   chmod 755 ~/.calimero-registry/data
   ```

3. **Artifact Copying Failures**:

   ```typescript
   // Solution: Check file permissions and paths
   if (!fs.existsSync(artifactPath)) {
     throw new Error(`Artifact not found: ${artifactPath}`);
   }
   ```

4. **Network Connectivity**:
   ```typescript
   // Solution: Add retry logic
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

## Key Takeaways

1. **Unified Interface**: All registry implementations use the same interface
2. **Environment Detection**: Automatically switch between local and remote
3. **Data Consistency**: Same data structure across all implementations
4. **Seamless Integration**: Existing CLI commands work with both registries
5. **Flexible Configuration**: Support for multiple environments and use cases

## When to Ask for Help

- **Integration Issues**: When you can't get local/remote registry working
- **Data Synchronization**: When migrating data between registries
- **Custom Implementations**: When creating new registry types
- **Performance Problems**: When registry operations are slow
- **Authentication Issues**: When dealing with remote registry auth

Remember: The registry system is designed to be flexible and extensible. Most integration issues can be solved by understanding the unified interface and choosing the right pattern for your use case.
