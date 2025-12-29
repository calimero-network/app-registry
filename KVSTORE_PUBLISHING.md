# KV Store App Publishing Guide

This guide explains how to publish the KV Store application to the Calimero Network production registry using Manifest V2 format.

## Overview

The KV Store is a demo application that showcases Calimero Network's key-value storage capabilities. It demonstrates:

- Smart contract deployment and interaction
- React frontend integration
- Bundle publishing workflow

## Prerequisites

1. **Built WASM**: Ensure the KV Store WASM is built

   ```bash
   cd ../kv-store
   ./logic/build.sh
   ```

2. **Registry CLI**: Ensure the registry CLI is built
   ```bash
   cd registry
   pnpm --filter registry-cli build
   ```

## Manifest V2 Format

The KV Store uses the new Manifest V2 format:

```json
{
  "version": "1.0",
  "package": "com.calimero.kvstore",
  "appVersion": "0.2.5",
  "metadata": {
    "name": "KV Store - Demo Application",
    "description": "A simple key-value store application demonstrating Calimero Network capabilities",
    "author": "Calimero Network"
  },
  "wasm": {
    "path": "logic/res/kv_store.wasm",
    "hash": "sha256:568f136877f4c1695082cb51247f44b2614d09dd1e888431395d3113e4050a25",
    "size": 346079
  },
  "links": {
    "frontend": "https://github.com/calimero-network/kv-store",
    "github": "https://github.com/calimero-network/kv-store",
    "docs": "https://github.com/calimero-network/kv-store#readme"
  }
}
```

## Publishing Process

### Automated Publishing (Recommended)

Use the automated publishing script:

```bash
# From the registry directory
./scripts/publish-kvstore.sh
```

This script will:

1. ✅ Verify the WASM file exists
2. 📦 Create an MPK bundle
3. 🔍 Validate the bundle
4. 📤 Push to production registry
5. 🧹 Clean up temporary files

### Manual Publishing

If you prefer manual control:

```bash
# 1. Create the bundle
./packages/cli/dist/index.js bundle create \
    --output kvstore-0.2.5.mpk \
    --name "KV Store - Demo Application" \
    --description "A simple key-value store application demonstrating Calimero Network capabilities" \
    --author "Calimero Network" \
    --frontend "https://github.com/calimero-network/kv-store" \
    --github "https://github.com/calimero-network/kv-store" \
    --docs "https://github.com/calimero-network/kv-store#readme" \
    ../kv-store/logic/res/kv_store.wasm \
    com.calimero.kvstore \
    0.2.5

# 2. Verify the bundle
./packages/cli/dist/index.js bundle get com.calimero.kvstore 0.2.5 --bundle kvstore-0.2.5.mpk

# 3. Push to production
curl -X POST "https://apps.calimero.network/api/v2/bundles/push" \
  -H "Content-Type: application/json" \
  -d @kvstore-manifest.json
```

## Production Registry Details

- **URL**: `https://apps.calimero.network`
- **Package**: `com.calimero.kvstore`
- **Version**: `0.2.5`
- **Format**: Manifest V2 (Bundle)

## Verification

After publishing, verify the app is available:

```bash
# Check if the bundle exists
curl "https://apps.calimero.network/api/v2/bundles/com.calimero.kvstore/0.2.5"

# Or use curl
curl "https://apps.calimero.network/api/v2/bundles/com.calimero.kvstore/0.2.5"
```

## Troubleshooting

### WASM File Not Found

```bash
cd ../kv-store
./logic/build.sh
```

### Registry CLI Not Available

```bash
pnpm --filter registry-cli build
```

### Authentication Issues

Ensure you have proper credentials for the production registry. The CLI will prompt for authentication if needed.

### Bundle Validation Errors

- Check that the WASM file hash matches the manifest
- Ensure the package name follows the reverse domain notation
- Verify all required fields are present in the bundle

## Related Files

- `scripts/publish-kvstore.sh` - Automated publishing script
- `../kv-store/manifest.json` - Application manifest (V2 format)
- `../kv-store/logic/res/kv_store.wasm` - Compiled WASM binary
- `packages/cli/` - Registry CLI for bundle operations

## Next Steps

After successful publishing:

1. Test the app in a Calimero Network context
2. Update any documentation with the new registry URLs
3. Consider setting up automated publishing in CI/CD

---

**Last Updated**: December 29, 2024
**KV Store Version**: 0.2.5
**Manifest Format**: V2
