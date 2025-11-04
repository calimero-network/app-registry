#!/bin/bash
# Submit New Version Helper
# Usage: ./scripts/submit-new-version.sh <wasm-file> <app-id> <new-version>
#
# Example:
#   ./scripts/submit-new-version.sh meropass.wasm network.calimero.meropass 0.2.0

set -e

if [ "$#" -ne 3 ]; then
    echo "❌ Usage: $0 <wasm-file> <app-id> <new-version>"
    echo ""
    echo "Example:"
    echo "  $0 meropass.wasm network.calimero.meropass 0.2.0"
    exit 1
fi

WASM_FILE="$1"
APP_ID="$2"
NEW_VERSION="$3"
REGISTRY_URL="${REGISTRY_URL:-https://mero-registry.vercel.app}"

echo "🔍 Verifying WASM file..."
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ File not found: $WASM_FILE"
    exit 1
fi

FILE_SIZE=$(wc -c < "$WASM_FILE" | tr -d ' ')
echo "✅ File size: $FILE_SIZE bytes"

echo ""
echo "🔐 Calculating SHA256 digest..."
DIGEST=$(shasum -a 256 "$WASM_FILE" | awk '{print $1}')
echo "✅ SHA256: $DIGEST"

echo ""
echo "📦 Fetching existing manifest for reference..."
LATEST_MANIFEST=$(curl -s "$REGISTRY_URL/api/apps" | jq ".[] | select(.id==\"$APP_ID\")")

if [ -z "$LATEST_MANIFEST" ]; then
    echo "❌ App $APP_ID not found in registry"
    exit 1
fi

APP_NAME=$(echo "$LATEST_MANIFEST" | jq -r '.name')
echo "✅ Found app: $APP_NAME"

echo ""
echo "📄 Create manifest for version $NEW_VERSION:"
echo "   1. Upload WASM to GitHub Releases or IPFS"
echo "   2. Use this template:"
echo ""

cat << EOF
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
    "uri": "https://github.com/calimero-network/app-registry/releases/download/XXX/YYY.wasm"
  },
  "provides": [],
  "requires": [],
  "dependencies": []
}
EOF

echo ""
echo ""
echo "📤 Next steps:"
echo "   1. Upload $WASM_FILE to GitHub Releases:"
echo "      gh release create $APP_ID-v$NEW_VERSION \\"
echo "        --repo calimero-network/app-registry \\"
echo "        --title \"$APP_NAME v$NEW_VERSION\" \\"
echo "        --notes \"Version $NEW_VERSION\" \\"
echo "        $WASM_FILE"
echo ""
echo "   2. Update the URI in manifest and submit:"
echo "      curl -X POST $REGISTRY_URL/api/v1/apps \\"
echo "        -H \"Content-Type: application/json\" \\"
echo "        -d @manifest.json"

