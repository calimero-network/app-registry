# Developer Enrollment & Authentication Plan for V2 Bundles

## Overview

To enable developers to push bundles to the production registry, we need a secure enrollment and authentication system. This document outlines the requirements and implementation plan.

## Current State

### Existing Infrastructure

- ✅ Developer profiles (`DeveloperProfile` interface)
- ✅ `/developers` endpoint for profile management
- ✅ Public key-based identification (`ed25519` pubkeys)
- ✅ Signature verification for V1 manifests
- ✅ Developer profile creation via CLI

### Missing for V2 Bundles

- ❌ Authentication/authorization for bundle push
- ❌ Developer enrollment workflow
- ❌ Namespace ownership verification
- ❌ API key or token system
- ❌ Bundle signature verification on push

## Requirements

### 1. Developer Enrollment

**Process:**

1. Developer generates Ed25519 keypair
2. Developer submits enrollment request with:
   - Public key
   - Display name
   - Contact information (email, website)
   - Proofs (GitHub, Twitter, etc.)
3. Registry validates and approves enrollment
4. Developer receives API credentials

**Storage:**

```typescript
interface EnrolledDeveloper {
  pubkey: string; // Ed25519 public key
  display_name: string;
  email?: string;
  website?: string;
  proofs: Proof[];
  enrolled_at: string; // ISO timestamp
  status: 'pending' | 'approved' | 'suspended';
  api_key?: string; // Optional API key for programmatic access
  namespaces: string[]; // Owned package namespaces (e.g., ["com.calimero.*"])
}
```

### 2. Namespace Ownership

**Policy:**

- Developers can only publish bundles for namespaces they own
- Namespace ownership is verified during enrollment
- Reserved namespaces (e.g., `com.calimero.*`) require special approval
- First-come-first-served for non-reserved namespaces

**Examples:**

- `com.calimero.*` → Requires Calimero team approval
- `com.johndoe.*` → Can be claimed by any enrolled developer
- `network.calimero.*` → Reserved for Calimero network apps

**Verification:**

- For reserved namespaces: Manual approval process
- For public namespaces: Automatic on first publish (if available)

### 3. Authentication Methods

#### Option A: API Key (Recommended for CLI)

```typescript
// Developer generates API key during enrollment
POST /api/v2/developers/enroll
{
  "pubkey": "ed25519:...",
  "display_name": "John Doe",
  "email": "john@example.com",
  "proofs": [...]
}

Response:
{
  "developer_id": "dev_abc123",
  "api_key": "cal_reg_...",  // Secret, shown only once
  "status": "pending"
}
```

#### Option B: Signature-Based (Recommended for Web)

```typescript
// Developer signs request with private key
POST /api/v2/bundles/push
Headers:
  X-Developer-Pubkey: ed25519:...
  X-Signature: <signature of request body>
Body:
  <bundle manifest>
```

#### Option C: JWT Tokens

```typescript
// Developer authenticates, receives JWT
POST /api/v2/auth/login
{
  "pubkey": "ed25519:...",
  "signature": "<signature of timestamp>"
}

Response:
{
  "token": "eyJhbGc...",
  "expires_at": "..."
}
```

### 4. Bundle Push Authentication

**V2 Bundle Push Endpoint:**

```typescript
POST /api/v2/bundles/push
Headers:
  Authorization: Bearer <api_key> | <jwt_token>
  OR
  X-Developer-Pubkey: ed25519:...
  X-Signature: <signature>

Body:
  - multipart/form-data with .mpk file
  OR
  - JSON with bundle manifest + artifact URL

Validation:
  1. Verify authentication (API key, JWT, or signature)
  2. Verify developer is enrolled and approved
  3. Verify namespace ownership
  4. Verify bundle signature (if present)
  5. Validate bundle manifest structure
  6. Store bundle and manifest
```

### 5. Bundle Signature Verification

**Developer Signature:**

- Bundle manifest includes `signature` field
- Signature is over canonicalized manifest JSON
- Verified using developer's public key
- Ensures bundle integrity and authorship

**Marketplace Signature:**

- Registry operator signs approved bundles
- Added after review/approval process
- Indicates registry endorsement

## Implementation Plan

### Phase 1: Developer Enrollment API

- [ ] Create `/api/v2/developers/enroll` endpoint
- [ ] Store enrolled developers in KV store
- [ ] Email verification (optional)
- [ ] Admin approval workflow

### Phase 2: Authentication System

- [ ] Implement API key generation
- [ ] Add API key validation middleware
- [ ] Implement signature-based auth
- [ ] Add JWT token support (optional)

### Phase 3: Namespace Management

- [ ] Namespace ownership storage
- [ ] Namespace verification on push
- [ ] Reserved namespace list
- [ ] Namespace transfer mechanism

### Phase 4: Bundle Push with Auth

- [ ] Update `/api/v2/bundles/push` endpoint
- [ ] Add authentication middleware
- [ ] Verify namespace ownership
- [ ] Verify bundle signatures
- [ ] Store bundles with developer metadata

### Phase 5: Developer Dashboard

- [ ] Web UI for enrollment
- [ ] API key management
- [ ] Namespace management
- [ ] Bundle publishing interface

## API Endpoints

### Enrollment

```
POST   /api/v2/developers/enroll          # Submit enrollment
GET    /api/v2/developers/:pubkey         # Get developer profile
PATCH  /api/v2/developers/:pubkey         # Update profile
```

### Authentication

```
POST   /api/v2/auth/login                 # Get JWT token (optional)
POST   /api/v2/auth/refresh               # Refresh token (optional)
```

### Bundle Management

```
POST   /api/v2/bundles/push               # Push bundle (requires auth)
GET    /api/v2/bundles/:package/:version  # Get bundle info (public)
DELETE /api/v2/bundles/:package/:version  # Delete bundle (requires auth)
```

### Namespace Management

```
GET    /api/v2/namespaces                 # List available namespaces
GET    /api/v2/namespaces/:namespace       # Get namespace owner
POST   /api/v2/namespaces/:namespace/claim # Claim namespace (requires auth)
```

## Security Considerations

1. **API Key Security:**
   - Keys are hashed before storage
   - Keys shown only once during enrollment
   - Rate limiting per API key
   - Key rotation mechanism

2. **Signature Verification:**
   - Use JCS (JSON Canonicalization) for deterministic signing
   - Ed25519 signatures for all auth operations
   - Timestamp nonces to prevent replay attacks

3. **Namespace Protection:**
   - Reserved namespaces require admin approval
   - First-come-first-served for public namespaces
   - Namespace transfer requires signature from both parties

4. **Bundle Integrity:**
   - Developer signature on manifest
   - Marketplace signature after approval
   - Artifact hash verification
   - Immutable versioning (same package@version = same content)

## Migration Path

1. **Phase 1:** Local registry only (no auth required)
2. **Phase 2:** Add enrollment, but allow unauthenticated pushes (with warnings)
3. **Phase 3:** Require authentication for production registry
4. **Phase 4:** Require namespace ownership verification

## Open Questions

1. **Approval Process:**
   - Automatic approval for public namespaces?
   - Manual review for reserved namespaces?
   - Reputation-based auto-approval?

2. **API Key vs Signature:**
   - Support both?
   - Which is primary?
   - CLI vs Web UI preference?

3. **Namespace Policy:**
   - How to handle namespace conflicts?
   - Transfer mechanism?
   - Expiration/release policy?

4. **Bundle Review:**
   - Automatic approval?
   - Manual review required?
   - Reputation-based trust?

## Next Steps

1. **Design Review:** Get feedback on enrollment process
2. **Prototype:** Build minimal enrollment API
3. **Test:** Test with local registry first
4. **Deploy:** Roll out to production registry

---

**Status:** Planning  
**Priority:** High (blocks production bundle publishing)  
**Estimated Effort:** 2-3 weeks
