# SSApp Registry CLI

A command-line interface tool for the SSApp (Smart Contract Application) Registry. Provides easy-to-use commands for managing applications, developers, and attestations directly from the terminal.

## 🚀 Features

- **Interactive Commands**: User-friendly interactive prompts
- **JSON Output**: Structured JSON output for scripting
- **Table Format**: Human-readable table output
- **Color-coded Output**: Syntax highlighting and status indicators
- **Auto-completion**: Command and option auto-completion
- **Configuration Management**: Persistent configuration storage
- **Batch Operations**: Support for bulk operations
- **Progress Indicators**: Visual progress bars for long operations

## 📦 Installation

### Global Installation

```bash
# Install globally from npm
npm install -g @xilos/ssapp-registry-cli

# Or using pnpm
pnpm add -g @xilos/ssapp-registry-cli

# Or using yarn
yarn global add @xilos/ssapp-registry-cli
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
ssapp-registry config set api-url https://api.ssapp-registry.com
ssapp-registry config set api-key your-api-key

# View current configuration
ssapp-registry config list
```

### Configuration Options

```bash
# Set API URL
ssapp-registry config set api-url https://your-api-url.com

# Set API key for authentication
ssapp-registry config set api-key your-api-key

# Set output format (json, table, yaml)
ssapp-registry config set output-format json

# Set default limit for list commands
ssapp-registry config set default-limit 20

# Enable/disable color output
ssapp-registry config set color-output true
```

## 📚 Command Reference

### Applications

#### List Applications

```bash
# List all applications
ssapp-registry apps list

# List with filters
ssapp-registry apps list --search wallet --verified --limit 10

# Output in JSON format
ssapp-registry apps list --output json

# Show specific fields
ssapp-registry apps list --fields name,version,developer
```

#### Get Application Details

```bash
# Get application by ID
ssapp-registry apps get app-id

# Get with full details
ssapp-registry apps get app-id --full

# Get manifest only
ssapp-registry apps get app-id --manifest
```

#### Create Application

```bash
# Interactive creation
ssapp-registry apps create

# Create from file
ssapp-registry apps create --file app-manifest.json

# Create with inline data
ssapp-registry apps create \
  --name "My SSApp" \
  --description "A smart contract application" \
  --version "1.0.0" \
  --developer-id "developer-id"
```

#### Update Application

```bash
# Update application
ssapp-registry apps update app-id --description "Updated description"

# Update from file
ssapp-registry apps update app-id --file updates.json

# Update version
ssapp-registry apps update app-id --version "1.1.0"
```

#### Delete Application

```bash
# Delete application
ssapp-registry apps delete app-id

# Force delete (skip confirmation)
ssapp-registry apps delete app-id --force
```

### Developers

#### List Developers

```bash
# List all developers
ssapp-registry developers list

# List with filters
ssapp-registry developers list --search john --verified

# Show developer apps
ssapp-registry developers list --include-apps
```

#### Get Developer Details

```bash
# Get developer by ID
ssapp-registry developers get developer-id

# Get with apps
ssapp-registry developers get developer-id --include-apps
```

#### Create Developer

```bash
# Interactive creation
ssapp-registry developers create

# Create with data
ssapp-registry developers create \
  --name "John Doe" \
  --email "john@example.com" \
  --public-key "ed25519:..."
```

### Attestations

#### List Attestations

```bash
# List all attestations
ssapp-registry attestations list

# List by app
ssapp-registry attestations list --app-id app-id

# List by developer
ssapp-registry attestations list --developer-id developer-id
```

#### Create Attestation

```bash
# Create attestation
ssapp-registry attestations create \
  --app-id app-id \
  --type verification \
  --data '{"verified": true, "reason": "Security audit passed"}'
```

### Utility Commands

#### Configuration

```bash
# List configuration
ssapp-registry config list

# Set configuration value
ssapp-registry config set key value

# Get configuration value
ssapp-registry config get key

# Reset configuration
ssapp-registry config reset
```

#### Health Check

```bash
# Check API health
ssapp-registry health

# Detailed health check
ssapp-registry health --detailed
```

## 🎯 Usage Examples

### Complete Application Workflow

```bash
# 1. Create a new application
ssapp-registry apps create \
  --name "DeFi Wallet" \
  --description "A decentralized finance wallet" \
  --version "1.0.0" \
  --developer-id "my-developer-id"

# 2. List applications to verify creation
ssapp-registry apps list --search "DeFi Wallet"

# 3. Get application details
ssapp-registry apps get app-id --full

# 4. Update the application
ssapp-registry apps update app-id \
  --description "Updated DeFi wallet with new features" \
  --version "1.1.0"

# 5. Create an attestation
ssapp-registry attestations create \
  --app-id app-id \
  --type verification \
  --data '{"verified": true, "audit": "passed"}'

# 6. List attestations
ssapp-registry attestations list --app-id app-id
```

### Batch Operations

```bash
# Create multiple applications from a file
cat apps.json | ssapp-registry apps create --batch

# Update multiple applications
ssapp-registry apps list --output json | \
  jq -r '.apps[].id' | \
  xargs -I {} ssapp-registry apps update {} --version "1.1.0"

# Delete all applications by a developer
ssapp-registry apps list --developer-id dev-id --output json | \
  jq -r '.apps[].id' | \
  xargs -I {} ssapp-registry apps delete {} --force
```

### Scripting Examples

#### Bash Script

```bash
#!/bin/bash

# Create application and get ID
APP_ID=$(ssapp-registry apps create \
  --name "My App" \
  --version "1.0.0" \
  --output json | jq -r '.id')

echo "Created app with ID: $APP_ID"

# Wait for processing
sleep 5

# Get app details
ssapp-registry apps get "$APP_ID" --output json
```

#### Node.js Script

```javascript
const { execSync } = require('child_process');

// Create application
const createResult = JSON.parse(
  execSync(
    'ssapp-registry apps create --name "My App" --output json'
  ).toString()
);

const appId = createResult.id;
console.log('Created app:', appId);

// Get application details
const appDetails = JSON.parse(
  execSync(`ssapp-registry apps get ${appId} --output json`).toString()
);

console.log('App details:', appDetails);
```

## 🔧 Advanced Features

### Output Formats

#### JSON Output

```bash
ssapp-registry apps list --output json
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
ssapp-registry apps list --output table
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
ssapp-registry apps list --output yaml
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
ssapp-registry interactive

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
ssapp-registry completion bash > ~/.bash_completion

# Enable auto-completion for zsh
ssapp-registry completion zsh > ~/.zsh_completion

# Enable auto-completion for fish
ssapp-registry completion fish > ~/.config/fish/completions/ssapp-registry.fish
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
