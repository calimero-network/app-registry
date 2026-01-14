# TODO: Implement Remote Push for Registry CLI

## Overview

Implement `bundle push --remote` functionality to allow pushing bundles directly to production registries via the CLI, eliminating the need for manual curl commands in publishing scripts.

**Current State:**

- ✅ `bundle push --local` works for local registries
- ❌ `bundle push --remote` shows "Remote push not implemented yet"
- ⚠️ Publishing scripts manually use curl to POST to `/api/v2/bundles/push`

**Goal:**
Replace manual curl-based publishing with a simple CLI command:

```bash
calimero-registry bundle push bundle.mpk --remote --url https://apps.calimero.network
```

---

## Implementation Tasks

### Phase 1: Core Remote Push Implementation

#### 1.1 Update CLI Command Options

- [ ] Add `--remote` flag to `bundle push` command
- [ ] Add `--url <registry-url>` option (default: `https://apps.calimero.network`)
- [ ] Add `--api-key <key>` option for future authentication
- [ ] Update command description and help text
- [ ] Ensure `--local` and `--remote` are mutually exclusive

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Location:** `createPushCommand()` function (line ~183)

---

#### 1.2 Implement Bundle Reading and Hex Conversion

- [ ] Read `.mpk` bundle file from disk
- [ ] Extract manifest from bundle (reuse existing `extractManifest()` function)
- [ ] Read entire bundle file as binary
- [ ] Convert bundle binary to hex string (using `xxd` equivalent in Node.js or Buffer methods)
- [ ] Calculate bundle size

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Dependencies:** Existing `extractManifest()` helper function

**Implementation Notes:**

- Use `fs.readFileSync()` or `fs.promises.readFile()` for binary reading
- Use `Buffer.toString('hex')` for hex conversion (Node.js built-in)
- Match the format used in `publish-kvstore.sh` (lines 75-82)

---

#### 1.3 Build Request Payload

- [ ] Extract manifest from bundle
- [ ] Calculate WASM hash and size from manifest (if available) or from bundle
- [ ] Construct JSON payload matching API format:
  ```json
  {
    "version": "1.0",
    "package": "...",
    "appVersion": "...",
    "metadata": {...},
    "wasm": {
      "hash": "sha256:...",
      "size": 12345
    },
    "links": {...},
    "_binary": "<hex-encoded-bundle>",
    "_overwrite": true
  }
  ```
- [ ] Preserve all manifest fields (metadata, links, interfaces, etc.)

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Reference:** `registry/scripts/publish-kvstore.sh` lines 89-113

---

#### 1.4 Implement HTTP Client

- [ ] Add HTTP client for POST request (use `fetch` or `axios` or Node.js built-in `https`)
- [ ] Set proper headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <api-key>` (if provided)
- [ ] POST to `{registryUrl}/api/v2/bundles/push`
- [ ] Handle request body as JSON string
- [ ] Set appropriate timeout (e.g., 60 seconds for large bundles)

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Dependencies:** Consider adding `node-fetch` or `axios` if not already present

**Implementation Notes:**

- Use Node.js 18+ built-in `fetch` if available
- Or use `https` module for production compatibility
- Handle large payloads (bundles can be 100KB+)

---

#### 1.5 Error Handling and Response Parsing

- [ ] Parse HTTP response status codes
- [ ] Handle success (201 Created)
- [ ] Handle errors:
  - 400 Bad Request (invalid manifest)
  - 401 Unauthorized (authentication required)
  - 403 Forbidden (namespace ownership)
  - 409 Conflict (version already exists, unless overwrite)
  - 500 Internal Server Error
- [ ] Extract and display error messages from response body
- [ ] Provide helpful error messages for common issues

**File:** `registry/packages/cli/src/commands/bundle.ts`

---

#### 1.6 Verification Step

- [ ] After successful push, verify bundle is available
- [ ] GET `{registryUrl}/api/v2/bundles/{package}/{version}`
- [ ] Compare returned manifest with pushed manifest
- [ ] Display success message with registry URL and endpoint

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Reference:** `publish-kvstore.sh` lines 129-141

---

### Phase 2: Configuration and Authentication

#### 2.1 Configuration File Support

- [ ] Create config file support for default registry URL
- [ ] Store config in `~/.calimero-registry/config.json` or similar
- [ ] Allow `--config` flag to specify config file location
- [ ] Support environment variable `CALIMERO_REGISTRY_URL`

**File:** `registry/packages/cli/src/lib/config.ts` (may need to create)

---

#### 2.2 API Key Management (Future-Proof)

- [ ] Add `--api-key` option to push command
- [ ] Support `CALIMERO_API_KEY` environment variable
- [ ] Store API key securely (use keychain/credential store if available)
- [ ] Add `bundle auth` command for managing credentials (future)

**File:** `registry/packages/cli/src/commands/bundle.ts`
**Note:** Currently API doesn't require auth, but prepare for future

---

### Phase 3: Testing

#### 3.1 Unit Tests

- [ ] Test bundle reading and hex conversion
- [ ] Test manifest extraction from bundle
- [ ] Test payload construction
- [ ] Test error handling for various HTTP status codes
- [ ] Mock HTTP requests/responses

**File:** `registry/packages/cli/src/commands/__tests__/bundle-push.test.ts`

---

#### 3.2 Integration Tests

- [ ] Test push to local registry (should work same as `--local`)
- [ ] Test push to test/staging registry (if available)
- [ ] Test with invalid bundle file
- [ ] Test with missing manifest
- [ ] Test with network errors
- [ ] Test verification step

**File:** `registry/packages/cli/src/commands/__tests__/bundle-push-integration.test.ts`

---

#### 3.3 E2E Test

- [ ] Create test bundle
- [ ] Push to test registry
- [ ] Verify bundle is accessible via API
- [ ] Verify manifest matches pushed data

**File:** `registry/packages/backend/tests/v2-e2e-api-flow.test.js` (update existing)

---

### Phase 4: Documentation and Migration

#### 4.1 Update CLI Help Text

- [ ] Update `bundle push` command description
- [ ] Add examples for `--remote` usage
- [ ] Document `--url` option
- [ ] Document `--api-key` option (when implemented)

**File:** `registry/packages/cli/src/commands/bundle.ts`

---

#### 4.2 Update Publishing Documentation

- [ ] Update `KVSTORE_PUBLISHING.md` with new CLI-based workflow
- [ ] Add example using `bundle push --remote`
- [ ] Keep manual curl method as alternative
- [ ] Document migration path from script to CLI

**File:** `registry/KVSTORE_PUBLISHING.md`

---

#### 4.3 Update Publishing Script

- [ ] Refactor `publish-kvstore.sh` to use CLI command
- [ ] Keep script as convenience wrapper
- [ ] Add option to use CLI vs manual method
- [ ] Update script comments

**File:** `registry/scripts/publish-kvstore.sh`

**New Script Flow:**

```bash
# Option 1: Use CLI (new way)
./packages/cli/dist/index.js bundle push "$BUNDLE_FILE" \
  --remote \
  --url "$REGISTRY_URL"

# Option 2: Keep manual method as fallback
# (existing curl-based code)
```

---

#### 4.4 Create Migration Guide

- [ ] Document breaking changes (if any)
- [ ] Provide examples for common use cases
- [ ] List benefits of using CLI vs manual script

**File:** `registry/MIGRATION_REMOTE_PUSH.md` (new file)

---

### Phase 5: Enhancements (Optional)

#### 5.1 Progress Indicators

- [ ] Add progress bar for large bundle uploads
- [ ] Show upload speed and ETA
- [ ] Use libraries like `cli-progress` or `ora`

---

#### 5.2 Dry Run Mode

- [ ] Add `--dry-run` flag
- [ ] Validate bundle without pushing
- [ ] Show what would be pushed
- [ ] Useful for CI/CD validation

---

#### 5.3 Batch Push

- [ ] Support pushing multiple bundles
- [ ] `bundle push *.mpk --remote`
- [ ] Parallel or sequential uploads
- [ ] Aggregate results

---

#### 5.4 Retry Logic

- [ ] Automatic retry on network errors
- [ ] Configurable retry count and backoff
- [ ] Exponential backoff for rate limiting

---

## Implementation Order

1. **Phase 1.1-1.4** - Core functionality (MVP)
2. **Phase 1.5-1.6** - Error handling and verification
3. **Phase 3.1-3.2** - Basic testing
4. **Phase 4.1-4.2** - Documentation
5. **Phase 4.3** - Update publishing script
6. **Phase 2.1-2.2** - Configuration and auth (when needed)
7. **Phase 3.3** - E2E testing
8. **Phase 5.x** - Enhancements as needed

---

## API Compatibility

**Current API Endpoint:**

```
POST /api/v2/bundles/push
Content-Type: application/json

Body:
{
  "version": "1.0",
  "package": "com.calimero.kvstore",
  "appVersion": "0.2.6",
  "metadata": {...},
  "wasm": {
    "hash": "sha256:...",
    "size": 12345
  },
  "links": {...},
  "_binary": "<hex-encoded-bundle>",
  "_overwrite": true
}
```

**Response (201 Created):**

```json
{
  "message": "Bundle published successfully",
  "package": "com.calimero.kvstore",
  "version": "0.2.6"
}
```

**Note:** Currently no authentication required, but prepare for future auth support.

---

## Testing Checklist

Before marking as complete:

- [ ] Can push bundle to local registry (`--local`)
- [ ] Can push bundle to remote registry (`--remote --url`)
- [ ] Handles missing bundle file gracefully
- [ ] Handles invalid bundle format gracefully
- [ ] Handles network errors gracefully
- [ ] Verifies bundle after push
- [ ] Shows helpful error messages
- [ ] Works with existing `publish-kvstore.sh` script
- [ ] Documentation is updated
- [ ] Tests pass

---

## Related Files

- `registry/packages/cli/src/commands/bundle.ts` - Main implementation
- `registry/scripts/publish-kvstore.sh` - Current publishing script
- `registry/KVSTORE_PUBLISHING.md` - Publishing documentation
- `registry/api/v2/bundles/push.js` - API endpoint handler
- `registry/packages/cli/src/lib/local-storage.ts` - Local storage utilities (reference)

---

## Notes

- The current API accepts bundles via JSON with hex-encoded binary in `_binary` field
- Future API versions may support multipart/form-data uploads (more efficient)
- Authentication is not currently required but should be prepared for
- The CLI should match the behavior of `publish-kvstore.sh` for consistency

---

**Created:** 2025-01-14
**Status:** Not Started
**Priority:** Medium
**Estimated Effort:** 4-6 hours
