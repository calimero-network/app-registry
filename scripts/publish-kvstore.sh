#!/bin/bash

# ⚠️  DEPRECATED: This script is deprecated. Use the CLI directly instead.
#
# Use the CLI commands instead:
#   calimero-registry bundle create ... && calimero-registry bundle push ... --remote
#
# See KVSTORE_PUBLISHING.md for the recommended workflow.
#
# This script is kept for backwards compatibility only and may be removed in a future version.
#
# Usage (deprecated):
#   ./publish-kvstore.sh [VERSION]

set -e

# Configuration
VERSION="${1:-0.2.7}"  # Use first argument or default to 0.2.7
KVSTORE_DIR="../kv-store"
WASM_FILE="$KVSTORE_DIR/logic/res/kv_store.wasm"
PACKAGE="com.calimero.kvstore"
BUNDLE_FILE="kvstore-$VERSION.mpk"
CLI="./packages/cli/dist/index.js"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Deprecation warning
echo -e "${YELLOW}⚠️  WARNING: This script is deprecated.${NC}"
echo -e "${YELLOW}   Use CLI commands directly instead:${NC}"
echo -e "${YELLOW}   calimero-registry bundle create ... && calimero-registry bundle push ... --remote${NC}"
echo -e "${YELLOW}   See KVSTORE_PUBLISHING.md for details.${NC}"
echo ""
echo -e "${BLUE}🚀 Publishing KV Store v$VERSION${NC}"

# Check WASM file
if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}❌ WASM file not found: $WASM_FILE${NC}"
    echo -e "${YELLOW}💡 Build first: cd $KVSTORE_DIR && ./logic/build.sh${NC}"
    exit 1
fi

# Ensure CLI is built
if [ ! -f "$CLI" ]; then
    echo -e "${BLUE}📦 Building CLI...${NC}"
    pnpm --filter registry-cli build
fi

# Create bundle
echo -e "${BLUE}📦 Creating bundle...${NC}"
$CLI bundle create \
    --output "$BUNDLE_FILE" \
    --name "KV Store - Demo Application" \
    --description "A simple key-value store application demonstrating Calimero Network capabilities" \
    --author "Calimero Network" \
    --frontend "https://kv-store-alpha.vercel.app/" \
    --github "https://github.com/calimero-network/kv-store" \
    --docs "https://github.com/calimero-network/kv-store#readme" \
    "$WASM_FILE" \
    "$PACKAGE" \
    "$VERSION"

# Push to registry (uses config file)
echo -e "${BLUE}📤 Pushing to registry...${NC}"
$CLI bundle push "$BUNDLE_FILE" --remote

# Cleanup
rm -f "$BUNDLE_FILE"
echo -e "${GREEN}✅ Published KV Store v$VERSION${NC}"
