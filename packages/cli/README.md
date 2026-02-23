# Calimero Network App Registry CLI

A command-line interface tool for the Calimero Network App Registry. Provides easy-to-use commands for managing applications, developers, and attestations directly from the terminal.

## 🚀 Features

- **Interactive Commands**: User-friendly interactive prompts
- **JSON Output**: Structured JSON output for scripting
- **Table Format**: Human-readable table output
- **Color-coded Output**: Syntax highlighting and status indicators
- **Auto-completion**: Command and option auto-completion
- **Configuration Management**: Persistent configuration storage
- **Batch Operations**: Support for bulk operations
- **Progress Indicators**: Visual progress bars for long operations
- **🆕 Local Registry**: Complete local development environment with file-based storage and artifact serving

## 📦 Installation

### Global Installation

```bash
# Install globally from npm
npm install -g @calimero-network/registry-cli

# Or using pnpm
pnpm add -g @calimero-network/registry-cli

# Or using yarn
yarn global add @calimero-network/registry-cli
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/calimero-network/app-registry.git
cd app-registry/packages/cli

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Link locally for development
pnpm link
```

## 🔧 Configuration

### Initial Setup

```bash
# Configure the CLI
calimero-registry config set api-url https://api.calimero.network
calimero-registry config set api-key your-api-key

# View current configuration
calimero-registry config list
```

### Configuration Options

```bash
# Set API URL
calimero-registry config set api-url https://your-api-url.com

# Set API key for authentication
calimero-registry config set api-key your-api-key

# Set output format (json, table, yaml)
calimero-registry config set output-format json

# Set default limit for list commands
calimero-registry config set default-limit 20

# Enable/disable color output
calimero-registry config set color-output true
```

## 🏠 Local Registry for Development

The CLI now includes a complete local registry for development purposes. This allows you to test app submissions, manage applications, and serve artifacts locally without requiring a remote registry server.

### Quick Start with Local Registry

```bash
# Start local registry
calimero-registry local start

# Use local registry with existing commands
calimero-registry apps list --local
calimero-registry apps submit manifest.json --local
calimero-registry health --local

# Stop local registry
calimero-registry local stop
```

### Local Registry Management

```bash
# Check status
calimero-registry local status

# Seed with sample data
calimero-registry local seed

# Reset all data
calimero-registry local reset --force

# Backup data
calimero-registry local backup

# Restore from backup
calimero-registry local restore backup.json
```

### Key Benefits

- **🔄 Offline Development**: Work without internet connection
- **⚡ Fast Iteration**: No network delays
- **📁 File-Based Storage**: No database required
- **🔧 Local Artifacts**: Serve files locally instead of IPFS
- **🛡️ Data Isolation**: Safe development without affecting production
- **👥 Team Collaboration**: Share local registry configurations

### Local vs Remote Registry

| Feature      | Remote Registry | Local Registry |
| ------------ | --------------- | -------------- |
| Storage      | Database        | JSON Files     |
| Artifacts    | IPFS            | Local Files    |
| Network      | Required        | Offline        |
| Setup        | Complex         | Simple         |
| Data Control | Limited         | Full Control   |

For detailed local registry documentation, see [LOCAL_REGISTRY.md](./LOCAL_REGISTRY.md).

## 📚 Command Reference

### Applications

#### List Applications

```bash
# List all applications
calimero-registry apps list

# List with filters
calimero-registry apps list --search wallet --verified --limit 10

# Output in JSON format
calimero-registry apps list --output json

# Show specific fields
calimero-registry apps list --fields name,version,developer

# Use local registry
calimero-registry apps list --local
```

#### Get Application Details

```bash
# Get application by ID
calimero-registry apps get app-id

# Get with full details
calimero-registry apps get app-id --full

# Get manifest only
calimero-registry apps get app-id --manifest
```

#### Create Application

```bash
# Interactive creation
calimero-registry apps create

# Create from file
calimero-registry apps create --file app-manifest.json

# Create with inline data
calimero-registry apps create \
  --name "My self-sovereign application" \
  --description "A smart contract application" \
  --version "1.0.0" \
  --developer-id "developer-id"

# Submit to local registry
calimero-registry apps submit manifest.json --local
```

#### Update Application

```bash
# Update application
calimero-registry apps update app-id --description "Updated description"

# Update from file
calimero-registry apps update app-id --file updates.json

# Update version
calimero-registry apps update app-id --version "1.1.0"
```

#### Delete Application

```bash
# Delete application
calimero-registry apps delete app-id

# Force delete (skip confirmation)
calimero-registry apps delete app-id --force
```

### Developers

#### List Developers

```bash
# List all developers
calimero-registry developers list

# List with filters
calimero-registry developers list --search john --verified

# Show developer apps
calimero-registry developers list --include-apps
```

#### Get Developer Details

```bash
# Get developer by ID
calimero-registry developers get developer-id

# Get with apps
calimero-registry developers get developer-id --include-apps
```

#### Create Developer

```bash
# Interactive creation
calimero-registry developers create

# Create with data
calimero-registry developers create \
  --name "John Doe" \
  --email "john@example.com" \
  --public-key "ed25519:..."
```

### Attestations

#### List Attestations

```bash
# List all attestations
calimero-registry attestations list

# List by app
calimero-registry attestations list --app-id app-id

# List by developer
calimero-registry attestations list --developer-id developer-id
```

#### Create Attestation

```bash
# Create attestation
calimero-registry attestations create \
  --app-id app-id \
  --type verification \
  --data '{"verified": true, "reason": "Security audit passed"}'
```

### Local Registry Commands

#### Start/Stop Local Registry

```bash
# Start local registry
calimero-registry local start

# Start on specific port
calimero-registry local start --port 8083

# Stop local registry
calimero-registry local stop

# Check status
calimero-registry local status
```

#### Data Management

```bash
# Seed with sample data
calimero-registry local seed

# Reset all data
calimero-registry local reset --force

# Backup data
calimero-registry local backup

# Restore from backup
calimero-registry local restore backup.json
```

### Utility Commands

#### Configuration

```bash
# List configuration
calimero-registry config list

# Set configuration value
calimero-registry config set key value

# Get configuration value
calimero-registry config get key

# Reset configuration
calimero-registry config reset
```

#### Health Check

```bash
# Check API health
calimero-registry health

# Detailed health check
calimero-registry health --detailed

# Check local registry health
calimero-registry health --local
```

## 🎯 Usage Examples

### Complete Application Workflow

```bash
# 1. Create a new application
calimero-registry apps create \
  --name "DeFi Wallet" \
  --description "A decentralized finance wallet" \
  --version "1.0.0" \
  --developer-id "my-developer-id"

# 2. List applications to verify creation
calimero-registry apps list --search "DeFi Wallet"

# 3. Get application details
calimero-registry apps get app-id --full

# 4. Update the application
calimero-registry apps update app-id \
  --description "Updated DeFi wallet with new features" \
  --version "1.1.0"

# 5. Create an attestation
calimero-registry attestations create \
  --app-id app-id \
  --type verification \
  --data '{"verified": true, "audit": "passed"}'

# 6. List attestations
calimero-registry attestations list --app-id app-id
```

### Local Development Workflow

```bash
# 1. Start local registry
calimero-registry local start

# 2. Seed with sample data
calimero-registry local seed

# 3. List apps from local registry
calimero-registry apps list --local

# 4. Submit new app to local registry
calimero-registry apps submit my-manifest.json --local

# 5. Get app manifest from local registry
calimero-registry apps manifest my-app 1.0.0 --local

# 6. Check local registry health
calimero-registry health --local

# 7. Backup local data
calimero-registry local backup

# 8. Stop local registry
calimero-registry local stop
```

### Batch Operations

```bash
# Create multiple applications from a file
cat apps.json | calimero-registry apps create --batch

# Update multiple applications
calimero-registry apps list --output json | \
  jq -r '.apps[].id' | \
  xargs -I {} calimero-registry apps update {} --version "1.1.0"

# Delete all applications by a developer
calimero-registry apps list --developer-id dev-id --output json | \
  jq -r '.apps[].id' | \
  xargs -I {} calimero-registry apps delete {} --force
```

### Scripting Examples

#### Bash Script

```bash
#!/bin/bash

# Create application and get ID
APP_ID=$(calimero-registry apps create \
  --name "My App" \
  --version "1.0.0" \
  --output json | jq -r '.id')

echo "Created app with ID: $APP_ID"

# Wait for processing
sleep 5

# Get app details
calimero-registry apps get "$APP_ID" --output json
```

#### Node.js Script

```javascript
const { execSync } = require('child_process');

// Create application
const createResult = JSON.parse(
  execSync(
    'calimero-registry apps create --name "My App" --output json'
  ).toString()
);

const appId = createResult.id;
console.log('Created app:', appId);

// Get application details
const appDetails = JSON.parse(
  execSync(`calimero-registry apps get ${appId} --output json`).toString()
);

console.log('App details:', appDetails);
```

## 🔧 Advanced Features

### Output Formats

#### JSON Output

```bash
calimero-registry apps list --output json
```

```json
{
  "apps": [
    {
      "id": "app-1",
      "name": "My App",
      "version": "1.0.0",
      "developer": {
        "id": "dev-1",
        "name": "John Doe"
      }
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### Table Output

```bash
calimero-registry apps list --output table
```

```
┌─────────┬──────────┬─────────┬─────────────┐
│ ID      │ Name     │ Version │ Developer   │
├─────────┼──────────┼─────────┼─────────────┤
│ app-1   │ My App   │ 1.0.0   │ John Doe    │
└─────────┴──────────┴─────────┴─────────────┘
```

#### YAML Output

```bash
calimero-registry apps list --output yaml
```

```yaml
apps:
  - id: app-1
    name: My App
    version: 1.0.0
    developer:
      id: dev-1
      name: John Doe
total: 1
limit: 20
offset: 0
```

### Interactive Mode

```bash
# Start interactive mode
calimero-registry interactive

# Available commands in interactive mode:
# > apps list
# > apps create
# > developers list
# > help
# > exit
```

### Auto-completion

```bash
# Enable auto-completion for bash
calimero-registry completion bash > ~/.bash_completion

# Enable auto-completion for zsh
calimero-registry completion zsh > ~/.zsh_completion

# Enable auto-completion for fish
calimero-registry completion fish > ~/.config/fish/completions/calimero-registry.fish
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/commands/apps.test.ts
```

### Test Examples

#### Command Test

```typescript
import { describe, it, expect } from 'vitest';
import { AppsCommand } from '../src/commands/apps';

describe('AppsCommand', () => {
  it('should list applications', async () => {
    const command = new AppsCommand();
    const result = await command.list({ limit: 10 });

    expect(result.apps).toBeDefined();
    expect(Array.isArray(result.apps)).toBe(true);
  });
});
```

#### Integration Test

```typescript
describe('CLI Integration', () => {
  it('should create and delete application', async () => {
    // Create app
    const createResult = await cli.run([
      'apps',
      'create',
      '--name',
      'Test App',
      '--version',
      '1.0.0',
      '--output',
      'json',
    ]);

    const appId = JSON.parse(createResult).id;
    expect(appId).toBeDefined();

    // Delete app
    await cli.run(['apps', 'delete', appId, '--force']);
  });
});
```

## 🚀 Build & Distribution

### Building the CLI

```bash
# Build the CLI
pnpm build

# Build with shebang for direct execution
pnpm build:cli

# Build for different platforms
pnpm build:linux
pnpm build:macos
pnpm build:windows
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

# Build the CLI
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

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
- **Documentation**: Check the command help with `--help`
- **Examples**: Review the test suite for usage examples
