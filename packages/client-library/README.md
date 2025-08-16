# SSApp Registry Client Library

A TypeScript client library for the SSApp (Smart Contract Application) Registry API. Provides type-safe methods for interacting with the registry, including application management, developer operations, and attestation handling.

## 🚀 Features

- **TypeScript**: Full type safety with comprehensive type definitions
- **Axios**: Reliable HTTP client with request/response interceptors
- **Error Handling**: Comprehensive error handling with custom error types
- **Request/Response Validation**: Automatic validation of API requests and responses
- **Retry Logic**: Configurable retry mechanisms for failed requests
- **Rate Limiting**: Built-in rate limiting support
- **Logging**: Configurable logging for debugging and monitoring

## 📦 Installation

```bash
# Install from npm
npm install @ssapp-registry/client

# Or using pnpm
pnpm add @ssapp-registry/client

# Or using yarn
yarn add @ssapp-registry/client
```

## 🔧 Configuration

### Basic Setup

```typescript
import { SSAppRegistryClient } from '@ssapp-registry/client';

const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
  apiKey: 'your-api-key', // Optional
  timeout: 10000, // 10 seconds
});
```

### Configuration Options

```typescript
interface ClientConfig {
  baseURL: string; // API base URL
  apiKey?: string; // API key for authentication
  timeout?: number; // Request timeout in milliseconds
  retries?: number; // Number of retry attempts
  retryDelay?: number; // Delay between retries in milliseconds
  rateLimit?: number; // Requests per minute
  logger?: Logger; // Custom logger instance
}
```

## 📚 API Reference

### Applications

#### List Applications

```typescript
// Get all applications
const apps = await client.apps.list();

// Get applications with filters
const apps = await client.apps.list({
  search: 'wallet',
  developer: 'developer-id',
  verified: true,
  limit: 20,
  offset: 0,
});

// Type-safe response
interface AppsResponse {
  apps: Application[];
  total: number;
  limit: number;
  offset: number;
}
```

#### Get Application by ID

```typescript
const app = await client.apps.getById('app-id');

// Type-safe application object
interface Application {
  id: string;
  name: string;
  description: string;
  version: string;
  developer: Developer;
  manifest: Manifest;
  artifacts: Artifact[];
  createdAt: string;
  updatedAt: string;
}
```

#### Create Application

```typescript
const newApp = await client.apps.create({
  name: 'My SSApp',
  description: 'A smart contract application',
  version: '1.0.0',
  developerId: 'developer-id',
  manifest: {
    // Manifest data
  },
  artifacts: [
    // Artifact data
  ],
});
```

#### Update Application

```typescript
const updatedApp = await client.apps.update('app-id', {
  description: 'Updated description',
  version: '1.1.0',
});
```

#### Delete Application

```typescript
await client.apps.delete('app-id');
```

### Developers

#### List Developers

```typescript
const developers = await client.developers.list({
  search: 'john',
  verified: true,
  limit: 10,
});
```

#### Get Developer by ID

```typescript
const developer = await client.developers.getById('developer-id');

interface Developer {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  verified: boolean;
  apps: Application[];
  createdAt: string;
}
```

#### Create Developer

```typescript
const developer = await client.developers.create({
  name: 'John Doe',
  email: 'john@example.com',
  publicKey: 'ed25519:...',
});
```

### Attestations

#### List Attestations

```typescript
const attestations = await client.attestations.list({
  appId: 'app-id',
  developerId: 'developer-id',
  type: 'verification',
});
```

#### Create Attestation

```typescript
const attestation = await client.attestations.create({
  appId: 'app-id',
  type: 'verification',
  data: {
    verified: true,
    reason: 'Passed security audit',
  },
  signature: 'ed25519:...',
});
```

## 🎯 Usage Examples

### Complete Application Management

```typescript
import { SSAppRegistryClient } from '@ssapp-registry/client';

const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
});

async function manageApplication() {
  try {
    // Create a new application
    const app = await client.apps.create({
      name: 'DeFi Wallet',
      description: 'A decentralized finance wallet',
      version: '1.0.0',
      developerId: 'my-developer-id',
      manifest: {
        permissions: ['wallet', 'network'],
        entrypoint: 'index.html',
      },
      artifacts: [
        {
          type: 'wasm',
          cid: 'QmHash...',
          size: 1024000,
        },
      ],
    });

    console.log('Created app:', app.id);

    // Update the application
    const updatedApp = await client.apps.update(app.id, {
      description: 'Updated DeFi wallet with new features',
      version: '1.1.0',
    });

    console.log('Updated app:', updatedApp.version);

    // List all applications
    const allApps = await client.apps.list({
      search: 'wallet',
      limit: 10,
    });

    console.log('Found apps:', allApps.apps.length);
  } catch (error) {
    if (error instanceof SSAppRegistryError) {
      console.error('API Error:', error.message);
      console.error('Status:', error.status);
      console.error('Code:', error.code);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}
```

### Error Handling

```typescript
import {
  SSAppRegistryClient,
  SSAppRegistryError,
} from '@ssapp-registry/client';

const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
});

async function handleErrors() {
  try {
    const app = await client.apps.getById('non-existent-id');
  } catch (error) {
    if (error instanceof SSAppRegistryError) {
      switch (error.status) {
        case 404:
          console.log('Application not found');
          break;
        case 401:
          console.log('Authentication required');
          break;
        case 403:
          console.log('Access forbidden');
          break;
        case 429:
          console.log('Rate limit exceeded');
          break;
        default:
          console.log('API error:', error.message);
      }
    }
  }
}
```

### Batch Operations

```typescript
async function batchOperations() {
  // Create multiple applications
  const appPromises = [
    client.apps.create({ name: 'App 1', version: '1.0.0' }),
    client.apps.create({ name: 'App 2', version: '1.0.0' }),
    client.apps.create({ name: 'App 3', version: '1.0.0' }),
  ];

  const apps = await Promise.all(appPromises);
  console.log(
    'Created apps:',
    apps.map(app => app.id)
  );

  // Update all apps
  const updatePromises = apps.map(app =>
    client.apps.update(app.id, { version: '1.1.0' })
  );

  const updatedApps = await Promise.all(updatePromises);
  console.log('Updated apps:', updatedApps.length);
}
```

## 🧪 Testing

### Unit Testing

```typescript
import { SSAppRegistryClient } from '@ssapp-registry/client';
import { mockApiResponse } from './test-utils';

describe('SSAppRegistryClient', () => {
  let client: SSAppRegistryClient;

  beforeEach(() => {
    client = new SSAppRegistryClient({
      baseURL: 'https://api.test.com',
    });
  });

  it('should list applications', async () => {
    const mockApps = [{ id: '1', name: 'Test App', version: '1.0.0' }];

    mockApiResponse('/apps', mockApps);

    const result = await client.apps.list();
    expect(result.apps).toEqual(mockApps);
  });

  it('should handle errors correctly', async () => {
    mockApiResponse('/apps/non-existent', null, 404);

    await expect(client.apps.getById('non-existent')).rejects.toThrow(
      SSAppRegistryError
    );
  });
});
```

### Integration Testing

```typescript
describe('Integration Tests', () => {
  let client: SSAppRegistryClient;

  beforeAll(() => {
    client = new SSAppRegistryClient({
      baseURL: process.env.TEST_API_URL,
      apiKey: process.env.TEST_API_KEY,
    });
  });

  it('should create and retrieve an application', async () => {
    // Create app
    const newApp = await client.apps.create({
      name: 'Integration Test App',
      version: '1.0.0',
      developerId: 'test-developer',
    });

    expect(newApp.id).toBeDefined();
    expect(newApp.name).toBe('Integration Test App');

    // Retrieve app
    const retrievedApp = await client.apps.getById(newApp.id);
    expect(retrievedApp).toEqual(newApp);

    // Cleanup
    await client.apps.delete(newApp.id);
  });
});
```

## 🔧 Advanced Configuration

### Custom Interceptors

```typescript
import axios from 'axios';

const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
});

// Add request interceptor
client.axios.interceptors.request.use(config => {
  console.log('Making request to:', config.url);
  return config;
});

// Add response interceptor
client.axios.interceptors.response.use(
  response => {
    console.log('Received response:', response.status);
    return response;
  },
  error => {
    console.error('Request failed:', error.message);
    return Promise.reject(error);
  }
);
```

### Custom Logger

```typescript
import { Logger } from '@ssapp-registry/client';

class CustomLogger implements Logger {
  info(message: string, data?: any) {
    console.log(`[INFO] ${message}`, data);
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error);
  }

  debug(message: string, data?: any) {
    console.debug(`[DEBUG] ${message}`, data);
  }
}

const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
  logger: new CustomLogger(),
});
```

### Retry Configuration

```typescript
const client = new SSAppRegistryClient({
  baseURL: 'https://api.ssapp-registry.com',
  retries: 3,
  retryDelay: 1000, // 1 second
  timeout: 30000, // 30 seconds
});
```

## 📊 Type Definitions

### Core Types

```typescript
// Application types
interface Application {
  id: string;
  name: string;
  description: string;
  version: string;
  developer: Developer;
  manifest: Manifest;
  artifacts: Artifact[];
  createdAt: string;
  updatedAt: string;
}

// Developer types
interface Developer {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  verified: boolean;
  apps: Application[];
  createdAt: string;
}

// Manifest types
interface Manifest {
  permissions: string[];
  entrypoint: string;
  metadata?: Record<string, any>;
}

// Artifact types
interface Artifact {
  type: 'wasm' | 'html' | 'js' | 'css';
  cid: string;
  size: number;
  hash?: string;
}
```

### Error Types

```typescript
class SSAppRegistryError extends Error {
  status: number;
  code: string;
  details?: any;

  constructor(message: string, status: number, code: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
```

## 🚀 Build & Distribution

### Building the Library

```bash
# Build the library
pnpm build

# Build with type declarations
pnpm build:types

# Build for different targets
pnpm build:esm    # ES modules
pnpm build:cjs    # CommonJS
pnpm build:umd    # UMD bundle
```

### Publishing

```bash
# Publish to npm
pnpm publish

# Publish with specific tag
pnpm publish --tag beta
```

## 🔧 Development

### Development Commands

```bash
# Install dependencies
pnpm install

# Build the library
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Type checking
pnpm type-check
```

### Code Quality

- **ESLint**: Code linting with TypeScript rules
- **Prettier**: Code formatting
- **TypeScript**: Static type checking
- **Vitest**: Unit testing framework
- **Coverage**: Test coverage reporting

## 📄 License

This package is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

See the main [CONTRIBUTING](../../CONTRIBUTING.md) guide for details on how to contribute to this package.

## 🆘 Support

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the API documentation
- **Examples**: Review the test suite for usage examples
