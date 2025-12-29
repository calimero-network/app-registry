#!/bin/bash

# Publish KV Store App to Production Registry
# This script creates and publishes the KV Store application bundle

set -e

# Configuration
KVSTORE_DIR="../kv-store"
REGISTRY_URL="https://registry.calimero.network"  # Production registry URL
WASM_FILE="$KVSTORE_DIR/logic/res/kv_store.wasm"
PACKAGE="com.calimero.kvstore"
VERSION="0.2.5"
BUNDLE_FILE="kvstore-$VERSION.mpk"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Publishing KV Store App v$VERSION to Production Registry${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if WASM file exists
if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}❌ WASM file not found: $WASM_FILE${NC}"
    echo -e "${YELLOW}💡 Run the build script first: cd $KVSTORE_DIR && ./logic/build.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found WASM file: $WASM_FILE${NC}"

# Check if registry CLI is available
if ! command -v ./packages/cli/dist/index.js &> /dev/null; then
    echo -e "${RED}❌ Registry CLI not found. Building CLI...${NC}"
    pnpm --filter registry-cli build
fi

echo -e "${GREEN}✅ Registry CLI ready${NC}"

# Create the bundle
echo -e "${BLUE}📦 Creating bundle...${NC}"
./packages/cli/dist/index.js bundle create \
    --output "$BUNDLE_FILE" \
    --name "KV Store - Demo Application" \
    --description "A simple key-value store application demonstrating Calimero Network capabilities" \
    --author "Calimero Network" \
    --frontend "https://github.com/calimero-network/kv-store" \
    --github "https://github.com/calimero-network/kv-store" \
    --docs "https://github.com/calimero-network/kv-store#readme" \
    "$WASM_FILE" \
    "$PACKAGE" \
    "$VERSION"

echo -e "${GREEN}✅ Bundle created: $BUNDLE_FILE${NC}"

# Verify bundle exists
echo -e "${BLUE}🔍 Verifying bundle...${NC}"
if [ -f "$BUNDLE_FILE" ]; then
    echo -e "${GREEN}✅ Bundle file exists: $BUNDLE_FILE${NC}"
    ls -la "$BUNDLE_FILE"
else
    echo -e "${RED}❌ Bundle file not found: $BUNDLE_FILE${NC}"
    exit 1
fi

# Push to production registry
echo -e "${BLUE}📤 Pushing to production registry: $REGISTRY_URL${NC}"
./packages/cli/dist/index.js -u "$REGISTRY_URL" bundle push \
    "$BUNDLE_FILE"

echo -e "${GREEN}🎉 Successfully published KV Store v$VERSION to production registry!${NC}"
echo -e "${GREEN}📋 Package: $PACKAGE${NC}"
echo -e "${GREEN}🏷️  Version: $VERSION${NC}"
echo -e "${GREEN}🌐 Registry: $REGISTRY_URL${NC}"

# Cleanup
rm -f "$BUNDLE_FILE"
echo -e "${GREEN}🧹 Cleaned up bundle file${NC}"
