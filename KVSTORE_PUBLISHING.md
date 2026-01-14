# Bundle Publishing Guide

This guide explains how to publish application bundles to the Calimero Network production registry using Manifest V2 format.

## Overview

This guide covers the complete workflow for publishing Calimero Network applications:

- Bundle creation from WASM files
- Manifest V2 format specification
- Publishing to production registry
- Verification and troubleshooting

## Prerequisites

1. **Built WASM**: Ensure your application's WASM file is built

   ```bash
   # Navigate to your application directory
   cd /path/to/your-app
   # Run your build script (adjust path as needed)
   ./build.sh
   ```

2. **Registry CLI**: Ensure the registry CLI is built
   ```bash
   cd registry
   pnpm --filter registry-cli build
   ```

## Manifest V2 Format

Applications use the Manifest V2 format:

```json
{
  "version": "1.0",
  "package": "com.example.myapp",
  "appVersion": "1.0.0",
  "metadata": {
    "name": "My Application",
    "description": "Application description",
    "author": "Your Name"
  },
  "wasm": {
    "path": "path/to/app.wasm",
    "hash": "sha256:...",
    "size": 12345
  },
  "links": {
    "frontend": "https://example.com",
    "github": "https://github.com/example/myapp",
    "docs": "https://example.com/docs"
  }
}
```

## Publishing Process

### Method 1: CLI-Based Publishing (Recommended) ✨

The easiest way to publish is using the registry CLI's built-in remote push:

#### Initial Setup (One-Time Configuration)

Configure your default registry URL and API key. The CLI stores configuration in `~/.calimero-registry/remote-config.json`:

```bash
# Set default registry URL
calimero-registry config set registry-url https://apps.calimero.network

# Set API key (optional, if authentication is required)
calimero-registry config set api-key your-api-key

# View your configuration
calimero-registry config list
```

**Config File Location:**

- User config: `~/.calimero-registry/remote-config.json` (created automatically)
- Project template: `.calimero-registry-config.json` (optional, for documentation)

**Alternative:** Use environment variables instead of config file:

```bash
export CALIMERO_REGISTRY_URL=https://apps.calimero.network
export CALIMERO_API_KEY=your-api-key
```

#### Publishing Workflow

**Example: Publishing KV Store v0.2.7**

```bash
# 1. Build the WASM file
cd kv-store
./logic/build.sh

# 2. Create the bundle
cd ../registry
calimero-registry bundle create \
    --output kvstore-0.2.7.mpk \
    --name "KV Store - Demo Application" \
    --description "A simple key-value store application demonstrating Calimero Network capabilities" \
    --author "Calimero Network" \
    --frontend "https://kv-store-alpha.vercel.app/" \
    --github "https://github.com/calimero-network/kv-store" \
    --docs "https://github.com/calimero-network/kv-store#readme" \
    ../kv-store/logic/res/kv_store.wasm \
    com.calimero.kvstore \
    0.2.7

# 3. Push to production registry (uses config file values)
calimero-registry bundle push kvstore-0.2.7.mpk --remote

# Or override config with flags
calimero-registry bundle push kvstore-0.2.7.mpk \
    --remote \
    --url https://apps.calimero.network \
    --api-key your-api-key
```

**General Workflow:**

```bash
# 1. Create the bundle
calimero-registry bundle create \
    --output myapp-1.0.0.mpk \
    --name "My Application" \
    --description "Application description" \
    --author "Your Name" \
    --frontend "https://example.com" \
    --github "https://github.com/example/myapp" \
    --docs "https://example.com/docs" \
    /path/to/app.wasm \
    com.example.myapp \
    1.0.0

# 2. Push to production registry (uses config file values)
calimero-registry bundle push myapp-1.0.0.mpk --remote
```

**Configuration Priority:**

1. Command-line flags (`--url`, `--api-key`)
2. Environment variables (`CALIMERO_REGISTRY_URL`, `CALIMERO_API_KEY`)
3. Config file (`~/.calimero-registry/remote-config.json`)
4. Defaults (https://apps.calimero.network)

The CLI will:

- ✅ Read and validate the bundle
- ✅ Extract manifest from bundle
- ✅ Convert bundle to hex format
- ✅ POST to `/api/v2/bundles/push`
- ✅ Verify bundle was stored correctly
- ✅ Display success message with registry URL

### Method 2: Convenience Script (Deprecated) ⚠️

~~For KV Store, there's a convenience script that wraps the CLI commands:~~

**⚠️ Deprecated:** The `publish-kvstore.sh` script is deprecated. Use Method 1 (CLI commands) instead.

The script is kept for backwards compatibility only and may be removed in a future version.

If you need automation, you can create your own scripts based on the CLI commands:

```bash
#!/bin/bash
# publish-myapp.sh

set -e

VERSION="${1:-1.0.0}"
WASM_FILE="./app.wasm"
PACKAGE="com.example.myapp"
BUNDLE_FILE="myapp-$VERSION.mpk"

# Create bundle
calimero-registry bundle create \
    --output "$BUNDLE_FILE" \
    --name "My Application" \
    --description "Application description" \
    --author "Your Name" \
    "$WASM_FILE" \
    "$PACKAGE" \
    "$VERSION"

# Push to registry (uses config file)
calimero-registry bundle push "$BUNDLE_FILE" --remote

# Cleanup
rm -f "$BUNDLE_FILE"
```

### Method 3: Manual Publishing (Advanced)

If you prefer full manual control:

```bash
# 1. Create the bundle
calimero-registry bundle create \
    --output myapp-1.0.0.mpk \
    --name "My Application" \
    --description "Application description" \
    --author "Your Name" \
    /path/to/app.wasm \
    com.example.myapp \
    1.0.0

# 2. Verify the bundle locally
calimero-registry bundle get com.example.myapp 1.0.0 --local

# 3. Push to production using curl (legacy method)
# Extract manifest, convert bundle to hex, then:
curl -X POST "https://apps.calimero.network/api/v2/bundles/push" \
  -H "Content-Type: application/json" \
  -d @manifest.json
```

## Production Registry Details

- **URL**: `https://apps.calimero.network`
- **Package Format**: Reverse domain notation (e.g., `com.example.myapp`)
- **Version Format**: Semantic versioning (e.g., `1.0.0`)
- **Manifest Format**: V2 (Bundle)
- **API Endpoint**: `/api/v2/bundles/push`

## Verification

After publishing, verify the app is available:

```bash
# Using CLI (recommended)
calimero-registry bundle get com.example.myapp 1.0.0 --remote

# Or using curl
curl "https://apps.calimero.network/api/v2/bundles/com.example.myapp/1.0.0"
```

The CLI push command automatically verifies the bundle after upload.

## Troubleshooting

### WASM File Not Found

```bash
# Navigate to your application directory
cd /path/to/your-app
# Run your build script
./build.sh
```

### Registry CLI Not Available

```bash
cd registry
pnpm --filter registry-cli build
```

### Authentication Issues

If authentication is required:

```bash
# Option 1: Set in config file (persistent)
calimero-registry config set api-key your-api-key

# Option 2: Use environment variable (session-based)
export CALIMERO_API_KEY=your-api-key

# Option 3: Provide via command line flag (one-time)
calimero-registry bundle push bundle.mpk --remote --api-key your-api-key
```

**Configuration Management:**

```bash
# View current configuration
calimero-registry config list

# Get specific value
calimero-registry config get registry-url
calimero-registry config get api-key

# Update configuration
calimero-registry config set registry-url https://apps.calimero.network
calimero-registry config set api-key your-api-key

# Reset to defaults
calimero-registry config reset
```

Currently, the production registry does not require authentication, but this may change in the future.

### Bundle Validation Errors

- Check that the WASM file hash matches the manifest
- Ensure the package name follows the reverse domain notation (e.g., `com.example.myapp`)
- Verify all required fields are present in the bundle
- Ensure version follows semantic versioning (e.g., `1.0.0`)

### Network Errors

If you encounter network errors:

```bash
# Check registry connectivity
curl https://apps.calimero.network/healthz

# Verify configuration
calimero-registry config list

# Try with verbose output
calimero-registry bundle push bundle.mpk --remote --url https://apps.calimero.network
```

## Package Naming Convention

Use reverse domain notation for package names:

- ✅ `com.example.myapp`
- ✅ `io.github.username.project`
- ✅ `org.organization.app`
- ❌ `my-app` (not reverse domain)
- ❌ `myapp` (not reverse domain)

## Version Format

Use semantic versioning (SemVer):

- ✅ `1.0.0`
- ✅ `0.2.7`
- ✅ `2.1.3-beta.1`
- ❌ `v1.0.0` (no 'v' prefix)
- ❌ `1.0` (incomplete)

## Related Files

- `packages/cli/` - Registry CLI for bundle operations (recommended)
- `api/v2/bundles/push.js` - API endpoint handler
- `scripts/publish-kvstore.sh` - ⚠️ Deprecated convenience script (use CLI instead)
- Your application's `manifest.json` - Application manifest (V2 format)
- Your application's WASM file - Compiled WASM binary

## Next Steps

After successful publishing:

1. Test the app in a Calimero Network context
2. Update any documentation with the new registry URLs
3. Consider setting up automated publishing in CI/CD
4. Set up version management workflow
5. Document your application's API and usage

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Publish Bundle

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build WASM
        run: ./build.sh

      - name: Install Registry CLI
        run: npm install -g @calimero-network/registry-cli

      - name: Create Bundle
        run: |
          calimero-registry bundle create \
            --output app-${{ github.event.release.tag_name }}.mpk \
            --name "My Application" \
            --description "${{ github.event.release.body }}" \
            ./app.wasm \
            com.example.myapp \
            ${{ github.event.release.tag_name }}

      - name: Publish Bundle
        env:
          CALIMERO_API_KEY: ${{ secrets.CALIMERO_API_KEY }}
        run: |
          calimero-registry bundle push app-${{ github.event.release.tag_name }}.mpk --remote
```

---

**Last Updated**: January 14, 2025
**Manifest Format**: V2
**CLI Remote Push**: ✅ Available
**Config File Support**: ✅ Available
**Latest KV Store Version**: 0.2.7
