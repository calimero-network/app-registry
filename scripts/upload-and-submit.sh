#!/bin/bash
# Upload WASM to GitHub and Submit to Registry (Complete Flow)
# Usage: ./scripts/upload-and-submit.sh <wasm-file> <app-id> <app-name> <new-version> [provides] [requires]
#
# Example:
#   ./scripts/upload-and-submit.sh meropass.wasm network.calimero.meropass "MeroPass - Password Vault" 0.2.0 '["password.vault@1"]' '[]'

set -e

if [ "$#" -lt 4 ]; then
    echo "❌ Usage: $0 <wasm-file> <app-id> <app-name> <new-version> [provides] [requires]"
    echo ""
    echo "Example:"
    echo "  $0 meropass.wasm network.calimero.meropass \"MeroPass\" 0.2.0 '[\"password.vault@1\",\"secret.manager@1\"]' '[]'"
    exit 1
fi

WASM_FILE="$1"
APP_ID="$2"
APP_NAME="$3"
NEW_VERSION="$4"
PROVIDES="${5:-[]}"
REQUIRES="${6:-[]}"
REGISTRY_URL="${REGISTRY_URL:-https://apps.calimero.network}"

echo "🚀 Complete Version Submission Flow"
echo "======================================"
echo ""

# Step 1: Verify WASM
echo "1️⃣  Verifying WASM file..."
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ File not found: $WASM_FILE"
    exit 1
fi

FILE_SIZE=$(wc -c < "$WASM_FILE" | tr -d ' ')
echo "   ✅ File size: $FILE_SIZE bytes"

DIGEST=$(shasum -a 256 "$WASM_FILE" | awk '{print $1}')
echo "   ✅ SHA256: $DIGEST"
echo ""

# Step 2: Upload to GitHub
RELEASE_TAG="$APP_ID-v$NEW_VERSION"
echo "2️⃣  Uploading to GitHub Releases..."
echo "   Tag: $RELEASE_TAG"

gh release create "$RELEASE_TAG" \
  --repo calimero-network/app-registry \
  --title "$APP_NAME v$NEW_VERSION" \
  --notes "Version $NEW_VERSION of $APP_NAME

## WASM Details
- **Size:** $FILE_SIZE bytes
- **SHA256:** $DIGEST" \
  "$WASM_FILE"

WASM_URL="https://github.com/calimero-network/app-registry/releases/download/$RELEASE_TAG/$(basename $WASM_FILE)"
echo "   ✅ Uploaded to: $WASM_URL"
echo ""

# Step 3: Create manifest
echo "3️⃣  Creating manifest..."
MANIFEST=$(cat << EOF
{
  "manifest_version": "1.0",
  "id": "$APP_ID",
  "name": "$APP_NAME",
  "version": "$NEW_VERSION",
  "chains": ["near:testnet", "near:mainnet"],
  "artifact": {
    "type": "wasm",
    "target": "node",
    "digest": "sha256:$DIGEST",
    "uri": "$WASM_URL"
  },
  "provides": $PROVIDES,
  "requires": $REQUIRES,
  "dependencies": []
}
EOF
)

echo "$MANIFEST" | jq '.'
echo ""

# Step 4: Submit to registry
echo "4️⃣  Submitting to registry..."
RESPONSE=$(echo "$MANIFEST" | curl -s -X POST "$REGISTRY_URL/api/v1/apps" \
  -H "Content-Type: application/json" \
  -d @-)

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    echo ""
    echo "🎉 SUCCESS! Version $NEW_VERSION submitted!"
    echo ""
    echo "🔗 View at: $REGISTRY_URL/apps/$APP_ID"
else
    echo ""
    echo "❌ Submission failed. Check the error above."
    exit 1
fi

