#!/bin/bash

# V1 API End-to-End Test Script
# Tests the complete V1 API workflow

set -e

BASE_URL="http://localhost:8080"
TEST_APP_ID="com.e2e.test.app.$(date +%s)"

echo "🧪 Starting V1 API End-to-End Tests..."

# Test 1: Health Check
echo "1️⃣ Testing health endpoint..."
curl -s "$BASE_URL/healthz" | grep -q '"status":"ok"' || (echo "❌ Health check failed" && exit 1)
echo "✅ Health check passed"

# Test 2: Statistics
echo "2️⃣ Testing statistics endpoint..."
curl -s "$BASE_URL/stats" | grep -q '"publishedApps"' || (echo "❌ Stats endpoint failed" && exit 1)
echo "✅ Statistics endpoint passed"

# Test 3: Submit Manifest
echo "3️⃣ Testing manifest submission..."
SUBMIT_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_version": "1.0",
    "id": "'$TEST_APP_ID'",
    "name": "E2E Test App",
    "version": "1.0.0",
    "chains": ["near:testnet"],
    "artifact": {
      "type": "wasm",
      "target": "node",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "uri": "https://example.com/e2e-test.wasm"
    },
    "provides": ["storage@1"],
    "requires": ["runtime@1"]
  }')

echo "$SUBMIT_RESPONSE" | grep -q '"id":"'$TEST_APP_ID'"' || (echo "❌ Manifest submission failed" && exit 1)
echo "✅ Manifest submission passed"

# Test 4: Get App Versions
echo "4️⃣ Testing app versions retrieval..."
VERSIONS_RESPONSE=$(curl -s "$BASE_URL/v1/apps/$TEST_APP_ID")
echo "$VERSIONS_RESPONSE" | grep -q '"id":"'$TEST_APP_ID'"' || (echo "❌ App versions retrieval failed" && exit 1)
echo "$VERSIONS_RESPONSE" | grep -q '"versions":\["1.0.0"\]' || (echo "❌ App versions content failed" && exit 1)
echo "✅ App versions retrieval passed"

# Test 5: Get Specific Manifest
echo "5️⃣ Testing specific manifest retrieval..."
MANIFEST_RESPONSE=$(curl -s "$BASE_URL/v1/apps/$TEST_APP_ID/1.0.0")
echo "$MANIFEST_RESPONSE" | grep -q '"id":"'$TEST_APP_ID'"' || (echo "❌ Manifest retrieval failed" && exit 1)
echo "$MANIFEST_RESPONSE" | grep -q '"name":"E2E Test App"' || (echo "❌ Manifest content failed" && exit 1)
echo "✅ Specific manifest retrieval passed"

# Test 6: Search Functionality
echo "6️⃣ Testing search functionality..."
SEARCH_RESPONSE=$(curl -s "$BASE_URL/v1/search?q=E2E")
echo "$SEARCH_RESPONSE" | grep -q '"id":"'$TEST_APP_ID'"' || (echo "❌ Search failed" && exit 1)
echo "✅ Search functionality passed"

# Test 7: Dependency Resolution
echo "7️⃣ Testing dependency resolution..."
RESOLVE_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/resolve" \
  -H "Content-Type: application/json" \
  -d '{
    "root": {"id": "'$TEST_APP_ID'", "version": "1.0.0"},
    "installed": []
  }')
echo "$RESOLVE_RESPONSE" | grep -q '"error":"missing_requirements"' || (echo "❌ Dependency resolution failed" && exit 1)
echo "✅ Dependency resolution passed (correctly detected missing requirements)"

# Test 8: Error Handling - Invalid Schema
echo "8️⃣ Testing error handling (invalid schema)..."
ERROR_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_version": "1.0",
    "id": "com.invalid.app"
  }')
echo "$ERROR_RESPONSE" | grep -q '"error":"invalid_schema"' || (echo "❌ Error handling failed" && exit 1)
echo "✅ Error handling passed"

# Test 9: Duplicate Submission
echo "9️⃣ Testing duplicate submission handling..."
DUPLICATE_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_version": "1.0",
    "id": "'$TEST_APP_ID'",
    "name": "E2E Test App",
    "version": "1.0.0",
    "chains": ["near:testnet"],
    "artifact": {
      "type": "wasm",
      "target": "node",
      "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      "uri": "https://example.com/duplicate.wasm"
    }
  }')
echo "$DUPLICATE_RESPONSE" | grep -q '"error":"already_exists"' || (echo "❌ Duplicate handling failed" && exit 1)
echo "✅ Duplicate submission handling passed"

# Test 10: Multiple Versions
echo "🔟 Testing multiple versions..."
V2_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_version": "1.0",
    "id": "'$TEST_APP_ID'",
    "name": "E2E Test App",
    "version": "2.0.0",
    "chains": ["near:testnet"],
    "artifact": {
      "type": "wasm",
      "target": "node",
      "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      "uri": "https://example.com/e2e-test-v2.wasm"
    }
  }')
echo "$V2_RESPONSE" | grep -q '"version":"2.0.0"' || (echo "❌ Version 2 submission failed" && exit 1)

# Check that both versions are listed
FINAL_VERSIONS=$(curl -s "$BASE_URL/v1/apps/$TEST_APP_ID")
echo "$FINAL_VERSIONS" | grep -q '"versions":\["2.0.0","1.0.0"\]' || echo "$FINAL_VERSIONS" | grep -q '"versions":\["1.0.0","2.0.0"\]' || (echo "❌ Multiple versions failed" && exit 1)
echo "✅ Multiple versions test passed"

echo ""
echo "🎉 All V1 API End-to-End Tests Passed!"
echo "✅ Health Check"
echo "✅ Statistics"
echo "✅ Manifest Submission"
echo "✅ App Versions Retrieval"
echo "✅ Specific Manifest Retrieval"
echo "✅ Search Functionality"
echo "✅ Dependency Resolution"
echo "✅ Error Handling"
echo "✅ Duplicate Handling"
echo "✅ Multiple Versions"
echo ""
echo "🚀 V1 API is fully functional!"
