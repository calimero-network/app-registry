# E2E Tests: Developer Registration, Namespace Claiming, and Bundle Upload

## Overview

This document describes the End-to-End (E2E) tests that demonstrate the complete workflow for developers to:

1. Register as a developer
2. Claim a namespace
3. Upload a bundle with signature verification

## Test Files

### `v2-e2e-simple.test.js`

**Status:** ✅ Passing  
**Purpose:** Simplified E2E tests that demonstrate the complete flow without requiring ES module imports.

**Test Coverage:**

- ✅ Developer registration (placeholder)
- ✅ Namespace claiming via first bundle upload
- ✅ Duplicate namespace@version prevention
- ✅ Bundle upload with signature (format validation)
- ✅ Bundle upload without signature (optional)
- ✅ Complete E2E flow: register → claim → upload → verify

### `v2-e2e-developer-flow.test.js`

**Status:** ⚠️ Requires ES module support  
**Purpose:** Comprehensive E2E tests with actual Ed25519 signature generation and verification.

**Test Coverage:**

- Developer registration (placeholder)
- Namespace claiming (first-come-first-serve)
- Bundle upload with real signature verification
- Complete E2E flow with signature
- Namespace ownership verification (future)

**Note:** This test file requires Jest ES module support. Currently disabled due to `@noble/ed25519` being an ES module.

### `v2-e2e-api-flow.test.js`

**Status:** ⚠️ Requires API endpoint fixes  
**Purpose:** E2E tests through actual HTTP API endpoints.

**Test Coverage:**

- Developer registration via API
- Namespace claiming via bundle upload API
- Bundle upload with signature via API
- Bundle retrieval via API
- Complete E2E flow via API

**Note:** This test file requires the API endpoints to be properly importable in tests.

## Running the Tests

```bash
# Run simplified E2E tests (recommended)
cd registry/packages/backend
npm test -- v2-e2e-simple

# Run all E2E tests
npm test -- v2-e2e
```

## Test Flow

### Step 1: Developer Registration (Placeholder)

Currently, developer registration is a placeholder. In the future, this will involve:

```javascript
POST /api/v2/developers/enroll
{
  "pubkey": "ed25519:...",
  "display_name": "Test Developer",
  "email": "dev@example.com"
}
```

**Current Implementation:**

- No authentication required (temporary for testing)
- Developer pubkey is tracked via bundle signatures
- Status is always "approved" (placeholder)

### Step 2: Namespace Claiming

Namespaces are claimed **first-come-first-serve** when the first bundle is uploaded.

**Rules:**

- Package name format: `com.example.app` (reverse domain notation)
- First developer to upload `package@version` claims that namespace@version
- Same developer can upload new versions to the same namespace
- Different developers cannot upload to the same `package@version`

**Example:**

```javascript
// Developer A uploads com.example.app@1.0.0 → Claims namespace
// Developer B tries to upload com.example.app@1.0.0 → 409 Conflict
// Developer A uploads com.example.app@2.0.0 → ✅ Success (new version)
```

### Step 3: Bundle Upload

Bundles can be uploaded with or without signatures.

**With Signature:**

```javascript
{
  version: "1.0",
  package: "com.example.app",
  appVersion: "1.0.0",
  metadata: { name: "My App" },
  wasm: { path: "app.wasm", size: 1024, hash: null },
  signature: {
    alg: "ed25519",
    pubkey: "ed25519:...",
    sig: "base64:...",
    signedAt: "2024-01-01T00:00:00Z"
  }
}
```

**Without Signature:**

- Currently allowed for testing
- In production, signatures may become required

**Validation:**

- Bundle manifest structure validation
- Signature verification (if present)
- First-come-first-serve check (package@version must not exist)

### Step 4: Bundle Retrieval

Uploaded bundles can be retrieved via:

```javascript
GET /api/v2/bundles/:package/:version
```

Returns the complete bundle manifest including metadata, interfaces, links, and signature.

## Future Enhancements

### Developer Enrollment System

When implemented, the developer enrollment system will:

1. **Registration:**
   - Developer submits enrollment request with pubkey
   - Registry operator reviews and approves
   - Developer receives API credentials

2. **Namespace Ownership:**
   - Registry tracks which developer owns which namespace
   - Reserved namespaces (e.g., `com.calimero.*`) require approval
   - Public namespaces are first-come-first-serve

3. **Signature Verification:**
   - Developer signature required for all bundles
   - Marketplace signature for approved bundles
   - Signature verification on upload and retrieval

### API Endpoint Tests

The `v2-e2e-api-flow.test.js` file will test the complete flow through HTTP endpoints:

- `POST /api/v2/developers/enroll` - Developer registration
- `POST /api/v2/bundles/push` - Bundle upload
- `GET /api/v2/bundles/:package/:version` - Bundle retrieval
- `GET /api/v2/namespaces/:namespace` - Namespace ownership check

## Test Data

### Sample Developer

```javascript
{
  pubkey: "ed25519:MCowBQYDK2VwAyEA...",
  display_name: "Test Developer",
  email: "dev@example.com",
  status: "approved"
}
```

### Sample Bundle

```javascript
{
  version: "1.0",
  package: "com.example.app",
  appVersion: "1.0.0",
  metadata: {
    name: "My App",
    description: "A test application",
    tags: ["test"],
    license: "MIT"
  },
  interfaces: {
    exports: ["com.example.api.v1"],
    uses: ["com.calimero.identity.v1"]
  },
  links: {
    frontend: "https://example.com/app",
    github: "https://github.com/example/app"
  },
  wasm: {
    path: "app.wasm",
    size: 4096,
    hash: "sha256:..."
  },
  abi: {
    path: "abi.json",
    size: 2048,
    hash: null
  },
  migrations: [],
  signature: {
    alg: "ed25519",
    pubkey: "ed25519:...",
    sig: "base64:...",
    signedAt: "2024-01-01T00:00:00Z"
  }
}
```

## Troubleshooting

### ES Module Import Errors

If you see errors about ES modules when running `v2-e2e-developer-flow.test.js`:

1. Use `v2-e2e-simple.test.js` instead (recommended)
2. Or configure Jest to support ES modules (see Jest documentation)

### API Endpoint Import Errors

If `v2-e2e-api-flow.test.js` fails to import API endpoints:

1. Check that the API endpoints exist in `registry/api/v2/bundles/`
2. Verify the import paths are correct
3. Consider using HTTP requests instead of direct imports

## Related Documentation

- [DEVELOPER_ENROLLMENT_PLAN.md](../../../DEVELOPER_ENROLLMENT_PLAN.md) - Developer enrollment system design
- [MANIFEST_V2_PLAN.md](../../../../../MANIFEST_V2_PLAN.md) - V2 manifest specification
- [Bundle Storage Documentation](../src/lib/bundle-storage-kv.js) - Storage implementation
