#!/bin/bash

# Publish KV Store App to Production Registry
# This script creates and publishes the KV Store application bundle

set -e

# Configuration
KVSTORE_DIR="../kv-store"
REGISTRY_URL="https://mero-registry-9onfdxo78-calimero-network.vercel.app"  # Production registry URL
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

# Create manifest JSON for API upload (v2 format)
echo -e "${BLUE}📋 Creating manifest JSON for upload...${NC}"

# Read MPK file and convert to hex for JSON transmission
if [ -f "$BUNDLE_FILE" ]; then
    echo -e "${BLUE}🔢 Converting bundle to hex for upload...${NC}"
    BUNDLE_HEX=$(xxd -p "$BUNDLE_FILE" | tr -d '\n')
    echo -e "${GREEN}✅ Bundle converted to hex (${#BUNDLE_HEX} characters)${NC}"
else
    echo -e "${RED}❌ Bundle file not found for hex conversion${NC}"
    exit 1
fi

MANIFEST_CONTENT=$(cat <<EOF
{
  "version": "1.0",
  "package": "$PACKAGE",
  "appVersion": "$VERSION",
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
  },
  "_binary": "$BUNDLE_HEX",
  "_overwrite": true
}
EOF
)

# Push manifest to production registry via the correct v2 endpoint
echo -e "${BLUE}📤 Pushing manifest to production registry: $REGISTRY_URL${NC}"
API_RESPONSE=$(echo "$MANIFEST_CONTENT" | curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$REGISTRY_URL/api/v2/bundles/push")

HTTP_CODE=$(echo "$API_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
RESPONSE_BODY=$(echo "$API_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" -eq 201 ]; then
    echo -e "${GREEN}✅ Bundle manifest uploaded successfully${NC}"

    # Verify the upload by attempting to get the bundle from remote registry
    echo -e "${BLUE}🔍 Verifying upload to remote registry...${NC}"
    VERIFY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        "$REGISTRY_URL/api/v2/bundles/$PACKAGE/$VERSION")

    VERIFY_CODE=$(echo "$VERIFY_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)

    if [ "$VERIFY_CODE" -eq 200 ]; then
        echo -e "${GREEN}🎉 Successfully published KV Store v$VERSION to production registry!${NC}"
        echo -e "${GREEN}📋 Package: $PACKAGE${NC}"
        echo -e "${GREEN}🏷️  Version: $VERSION${NC}"
        echo -e "${GREEN}🌐 Registry: $REGISTRY_URL${NC}"
        echo -e "${GREEN}🔗 Endpoint: $REGISTRY_URL/api/v2/bundles/$PACKAGE/$VERSION${NC}"
    else
        echo -e "${RED}❌ Upload verification failed - bundle not found on remote registry${NC}"
        echo -e "${YELLOW}💡 HTTP Status: $VERIFY_CODE${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Bundle upload failed${NC}"
    echo -e "${YELLOW}💡 HTTP Status: $HTTP_CODE${NC}"
    echo -e "${YELLOW}💡 Response: $RESPONSE_BODY${NC}"
    exit 1
fi

# Cleanup
rm -f "$BUNDLE_FILE"
echo -e "${GREEN}🧹 Cleaned up bundle file${NC}"
