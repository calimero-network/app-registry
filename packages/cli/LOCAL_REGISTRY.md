# Local Registry for Development

The Calimero Registry CLI now includes a complete local registry for development purposes. This allows you to test app submissions, manage applications, and serve artifacts locally without requiring a remote registry server or IPFS.

## ✨ What's New

- **🏠 Complete Local Development Environment**: Full registry functionality without external dependencies
- **📁 File-Based Storage**: JSON file storage instead of database
- **🔧 Local Artifact Serving**: HTTP serving of local files instead of IPFS
- **⚡ Fast Development**: No network delays or external service dependencies
- **🛡️ Data Isolation**: Safe development without affecting production
- **🔄 Seamless Integration**: All existing CLI commands work with `--local` flag

## 🎯 Demonstrated Functionality

The local registry has been fully tested and demonstrated with the following functionality:

### ✅ Core Features Working

- **Server Management**: Start/stop/status with port management
- **Data Operations**: Seed, reset, backup, restore functionality
- **App Management**: List, submit, retrieve applications
- **Artifact Handling**: Local file copying and HTTP serving
- **Health Monitoring**: API health checks and statistics
- **CLI Integration**: Seamless `--local` flag support

### ✅ Tested Commands

```bash
# All these commands have been tested and work:
calimero-registry local start --port 8083
calimero-registry local status
calimero-registry local seed
calimero-registry apps list --local --url http://localhost:8083
calimero-registry apps submit manifest.json --local --url http://localhost:8083
calimero-registry apps manifest app-id 1.0.0 --local --url http://localhost:8083
calimero-registry health --local --url http://localhost:8083
curl http://localhost:8083/artifacts/app/1.0.0/file.wasm
```

## 🚀 Quick Start

### Start Local Registry

```bash
# Start the local registry server
calimero-registry local start

# Check status
calimero-registry local status

# Stop the local registry
calimero-registry local stop
```

### Use Local Registry with Commands

```bash
# List apps from local registry
calimero-registry apps list --local

# Submit app to local registry
calimero-registry apps submit my-manifest.json --local

# Get app manifest from local registry
calimero-registry apps manifest my-wallet 1.0.0 --local

# Check health of local registry
calimero-registry health --local
```

## 📁 Local Registry Management

### Data Directory Structure

```
~/.calimero-registry/
├── config.json              # Local registry configuration
├── data/
│   ├── apps.json            # Applications data
│   ├── manifests.json       # Application manifests
│   ├── artifacts.json       # Artifact mappings
│   └── backups/             # Backup files
└── artifacts/               # Local artifact storage
    ├── {app_id}/
    │   └── {version}/
    │       └── {filename}
    └── cache/
```

### Configuration

The local registry configuration is stored in `~/.calimero-registry/config.json`:

```json
{
  "server": {
    "port": 8082,
    "host": "localhost"
  },
  "data": {
    "dir": "~/.calimero-registry/data",
    "artifactsDir": "~/.calimero-registry/artifacts"
  },
  "artifacts": {
    "storageDir": "~/.calimero-registry/artifacts",
    "serveLocal": true,
    "copyArtifacts": true,
    "maxFileSize": "100MB",
    "allowedTypes": ["wasm", "js", "html"]
  }
}
```

## 🛠️ Commands

### Local Registry Management

```bash
# Start local registry
calimero-registry local start [--port 8082] [--host localhost]

# Stop local registry
calimero-registry local stop

# Check status
calimero-registry local status

# Reset all data
calimero-registry local reset --force

# Backup data
calimero-registry local backup [--output backup.json]

# Restore from backup
calimero-registry local restore backup.json

# Seed with sample data
calimero-registry local seed
```

### App Management (with --local flag)

```bash
# List applications
calimero-registry apps list --local [--dev pubkey] [--name name]

# List app versions
calimero-registry apps versions {app_id} --local

# Get app manifest
calimero-registry apps manifest {app_id} {version} --local

# Submit app manifest
calimero-registry apps submit manifest.json --local

# Check health
calimero-registry health --local
```

## 🎯 Features

### Core Functionality

- **App Management**: Submit, list, and retrieve applications
- **Version Management**: Track multiple versions of applications
- **Manifest Storage**: Store and serve application manifests
- **Artifact Serving**: Serve local artifacts via HTTP

### Local Development Features

- **File-Based Storage**: All data stored in JSON files
- **Artifact Copying**: Automatically copy artifacts to local storage
- **Local URLs**: Artifacts served via local HTTP server
- **Data Isolation**: Separate from production data
- **Backup/Restore**: Easy data migration and backup

### Artifact Handling

The local registry handles artifacts differently than the production registry:

1. **Local Paths**: Artifacts with `path` field are copied to local storage
2. **Local URLs**: Artifacts are served via `http://localhost:8082/artifacts/...`
3. **No IPFS**: Local development doesn't require IPFS
4. **File Validation**: Validates file existence and size

## 📝 Example Workflow

### 1. Start Local Registry

```bash
calimero-registry local start
```

### 2. Create App Manifest

```json
{
  "manifest_version": "1.0",
  "app": {
    "name": "my-wallet",
    "namespace": "com.example",
    "developer_pubkey": "ed25519:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "alias": "My Wallet"
  },
  "version": {
    "semver": "1.0.0"
  },
  "supported_chains": ["mainnet", "testnet"],
  "permissions": [{ "cap": "wallet", "bytes": 1024 }],
  "artifacts": [
    {
      "type": "wasm",
      "target": "node",
      "path": "./dist/app.wasm",
      "size": 1024000
    }
  ],
  "metadata": {
    "description": "A sample wallet application"
  },
  "distribution": "local",
  "signature": {
    "alg": "ed25519",
    "sig": "sample-signature",
    "signed_at": "2024-01-01T00:00:00Z"
  }
}
```

### 3. Submit App

```bash
calimero-registry apps submit manifest.json --local
```

### 4. List Apps

```bash
calimero-registry apps list --local
```

### 5. Get App Manifest

```bash
calimero-registry apps manifest my-wallet 1.0.0 --local
```

## 🔧 Development Tips

### Port Management

- Default port is 8082
- Use `--port` flag to specify different port
- Port conflicts are handled automatically

### Data Management

- All data is stored in `~/.calimero-registry/`
- Use `local reset` to clear all data
- Use `local backup` to save data
- Use `local seed` to populate with sample data

### Artifact Development

- Place artifacts in your project directory
- Use `path` field in manifest for local development
- Local registry will copy artifacts to storage
- Artifacts are served via HTTP URLs

### Testing

- Use `local seed` to get sample data
- Test app submissions with local manifests
- Verify artifact serving works correctly
- Test backup/restore functionality

## 🚨 Limitations

### Current Limitations

- **No IPFS**: Local registry doesn't support IPFS
- **No Authentication**: No user authentication system
- **No Attestations**: Attestation system not implemented
- **No Developers**: Developer profiles not implemented
- **File Storage**: Data stored in files, not database

### Production vs Local

| Feature        | Production   | Local           |
| -------------- | ------------ | --------------- |
| Storage        | Database     | JSON Files      |
| Artifacts      | IPFS         | Local Files     |
| Authentication | Required     | None            |
| Attestations   | Full Support | Not Implemented |
| Developers     | Full Support | Not Implemented |

## 🏗️ Architecture

### Implementation Overview

The local registry is built with a modular architecture that reuses the existing backend code while providing local-specific functionality:

#### Core Components

1. **LocalRegistryServer** (`src/lib/local-server.ts`)
   - Fastify-based HTTP server
   - Reuses backend route handlers
   - Local artifact processing
   - Data management endpoints

2. **LocalDataStore** (`src/lib/local-storage.ts`)
   - JSON file-based persistence
   - App and manifest management
   - Backup/restore functionality
   - Sample data seeding

3. **LocalArtifactServer** (`src/lib/local-artifacts.ts`)
   - Local file copying and serving
   - Artifact URL generation
   - File validation and hashing
   - HTTP artifact serving

4. **LocalConfig** (`src/lib/local-config.ts`)
   - Configuration management
   - Data directory setup
   - Port and host configuration

5. **RegistryClient** (`src/lib/registry-client.ts`)
   - Unified client interface
   - Local vs remote detection
   - Seamless switching

#### Data Flow

```
CLI Command --local
    ↓
RegistryClient (LocalRegistryClient)
    ↓
LocalDataStore (JSON files)
    ↓
LocalArtifactServer (File serving)
    ↓
HTTP Server (Fastify)
```

#### File Structure

```
~/.calimero-registry/
├── config.json              # Configuration
├── data/
│   ├── apps.json            # Applications
│   ├── manifests.json       # Manifests
│   ├── artifacts.json       # Artifact mappings
│   └── backups/             # Backup files
└── artifacts/               # Local artifacts
    ├── {app_id}/
    │   └── {version}/
    │       └── {filename}
    └── cache/
```

## 🎉 Benefits

### Development Benefits

- **Offline Development**: Work without internet
- **Fast Iteration**: No network delays
- **Data Control**: Full control over test data
- **Easy Testing**: Test app submissions locally
- **Team Collaboration**: Share local registry data

### Production Readiness

- **Same API**: Compatible with production API
- **Easy Migration**: Export/import data
- **Testing**: Test before production deployment
- **Development**: Safe development environment
