# Calimero Registry v1 API Specification

## Overview

The Calimero Registry v1 is a minimal, production-ready HTTP service that stores, verifies, resolves, and serves self-sovereign application manifests following the v1 specification.

## Manifest v1 Schema

A valid manifest JSON has ONLY these fields:

```typescript
type ManifestV1 = {
  manifest_version: '1.0';
  id: string; // reverse-DNS: ^[a-z0-9]+(\.[a-z0-9-]+)+$
  name: string; // display name
  version: string; // semver
  chains: string[]; // e.g., "near:mainnet" | "near:testnet" | plain strings allowed
  artifact: {
    type: 'wasm';
    target: 'node';
    digest: string; // "sha256:<64hex>"
    uri: string; // https://... or ipfs://...
  };
  provides?: string[]; // ["iface@major"]
  requires?: string[]; // ["iface@major"]
  dependencies?: { id: string; range: string }[];
  signature?: {
    alg: 'ed25519';
    pubkey: string;
    sig: string;
    signed_at: string;
  };
  _warnings?: string[]; // registry may add on read; never required from publisher
};
```

## API Endpoints

### POST `/v1/apps`

**Purpose**: Accept and validate manifests

**Request Body**: `ManifestV1` JSON

**Validation**:

- Schema validation for required fields
- Signature verification (if present) using JCS canonicalization + Ed25519
- Digest format validation: `^sha256:[0-9a-f]{64}$`
- Optional artifact fetch verification (configurable)

**Responses**:

- `201 Created`: `{ id, version, canonical_uri }`
- `400 invalid_schema`: Invalid manifest structure
- `400 invalid_signature`: Ed25519 verification failed
- `400 invalid_digest`: Digest format invalid
- `409 already_exists`: Manifest already exists
- `424 artifact_unreachable`: Artifact fetch failed

### GET `/v1/apps/:id`

**Purpose**: List all versions for an app

**Response**:

```json
{
  "id": "com.example.chat.manager",
  "versions": ["1.3.0", "1.2.0", "1.0.0"]
}
```

### GET `/v1/apps/:id/:version`

**Purpose**: Get specific manifest

**Query Parameters**:

- `canonical=true`: Return canonical JCS bytes (Base64 in JSON)

**Response**: Stored manifest as submitted, plus `_warnings` array

### GET `/v1/search?q=chat.channel@1`

**Purpose**: Search by id, name, provides, requires

**Response**: Array of `{ id, version, provides, requires }`

### POST `/v1/resolve`

**Purpose**: Dependency resolution

**Request Body**:

```json
{
  "root": { "id": "com.example.chat.manager", "version": "1.3.0" },
  "installed": [{ "id": "...", "version": "..." }] // optional
}
```

**Response**:

```json
{
  "plan": [
    {
      "action": "install",
      "id": "com.example.chat.channel",
      "version": "1.0.0"
    }
  ],
  "satisfies": ["chat.channel@1"],
  "missing": [] // list iface@major not satisfied
}
```

## Storage Model

### Tables/Collections

- `manifests`: key: `(id, version)`, fields: `json`, `canonical_jcs_base64`, `pubkey`, `artifact_digest`, `artifact_uri`, `created_at`
- `provides_index`: (id, version) → array of `iface@major`
- `requires_index`: (id, version) → array of `iface@major`
- `deps_index`: (id, version) → array of `{ dep_id, range }`

### Immutability

Once stored, manifest content must not change. If re-upload differs, reject 409.

## Validation & Canonicalization

- **JSON Schema**: Enforce minimal v1 fields; reject unknown top-level fields (except `_warnings` on read)
- **Canonicalization**: Implement JCS (RFC 8785-like). Serialize without `signature`
- **Signature verify**: Ed25519 over JCS bytes using `signature.pubkey`
- **Digest format**: `sha256:<64hex>`
- **URI format**: `https://` or `ipfs://`
- **Semver**: Validate `version` with standard semver

## Dependency & Interface Resolution

- **dependencies**: Resolve by `id` and semver range (highest available matching)
- **requires/provides**: Strings like `chat.channel@1`
- **Match rule**: Provider satisfies if `provides` contains exactly the same `iface@major`
- **Multiple providers**: Requirement satisfied if ≥1 present
- **Conflict rules**: Incompatible versions of same `id` return `dependency_conflict`
- **Cycle detection**: DFS over `(id, version)`

## Security & Abuse Controls

- **Max manifest size**: 64 KB
- **Max dependencies length**: 32
- **Artifact fetch**: Only `https` and `ipfs` schemes; limit size (100 MB) and timeout
- **Rate limit**: POSTs per `pubkey`
- **No mutable edits**: `_warnings` may be added on read responses only

## Configuration Flags

- `VERIFY_FETCH=true`: Enable artifact fetch verification
- `ALLOW_UNVERIFIED=true`: Allow unverified artifacts
- `REQUIRE_SIGNATURE=false`: Require signatures (default: false)
- `MAX_MANIFEST_SIZE=65536`: Maximum manifest size in bytes
- `MAX_DEPENDENCIES=32`: Maximum dependencies per manifest
- `ARTIFACT_FETCH_TIMEOUT=30000`: Artifact fetch timeout in ms
- `ARTIFACT_MAX_SIZE=104857600`: Maximum artifact size in bytes

## Error Responses

### 400 invalid_schema

```json
{
  "error": "invalid_schema",
  "details": ["artifact.digest missing or malformed"]
}
```

### 400 invalid_signature

```json
{
  "error": "invalid_signature",
  "details": "ed25519 verify failed for pubkey ed25519:..."
}
```

### 409 already_exists

```json
{
  "error": "already_exists",
  "details": "com.example.chat.manager@1.3.0"
}
```

### 422 dependency_conflict

```json
{
  "error": "dependency_conflict",
  "details": "com.example.chat.channel ranges ^1 vs ^2"
}
```

### 422 missing_requirements

```json
{
  "error": "missing_requirements",
  "details": ["chat.channel@1"]
}
```

## Example Manifests

### Chat Channel

```json
{
  "manifest_version": "1.0",
  "id": "com.example.chat.channel",
  "name": "Chat Channel",
  "version": "1.0.0",
  "chains": ["near:testnet"],
  "artifact": {
    "type": "wasm",
    "target": "node",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "uri": "https://example.com/artifacts/chat-channel/1.0.0/channel.wasm"
  },
  "provides": ["chat.channel@1"],
  "signature": {
    "alg": "ed25519",
    "pubkey": "ed25519:CHANNEL_PUBKEY_EXAMPLE",
    "sig": "base64:CHANNEL_SIGNATURE_EXAMPLE",
    "signed_at": "2025-01-01T00:00:00Z"
  }
}
```

### Chat Manager

```json
{
  "manifest_version": "1.0",
  "id": "com.example.chat.manager",
  "name": "Chat Manager",
  "version": "1.3.0",
  "chains": ["near:testnet"],
  "artifact": {
    "type": "wasm",
    "target": "node",
    "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "uri": "https://example.com/artifacts/chat-manager/1.3.0/manager.wasm"
  },
  "provides": ["chat.manager@1"],
  "requires": ["chat.channel@1"],
  "dependencies": [
    {
      "id": "com.example.chat.channel",
      "range": "^1.0.0"
    }
  ],
  "signature": {
    "alg": "ed25519",
    "pubkey": "ed25519:MANAGER_PUBKEY_EXAMPLE",
    "sig": "base64:MANAGER_SIGNATURE_EXAMPLE",
    "signed_at": "2025-01-02T00:00:00Z"
  }
}
```

## Dependencies

- **JCS Canonicalization**: `rfc8785` - RFC 8785 JSON Canonicalization
- **Ed25519 Verification**: `@noble/ed25519` - Fast, secure Ed25519 implementation
- **Semver**: `semver` - Semantic versioning
- **HTTP Client**: `node-fetch` - For artifact verification
- **IPFS**: `ipfs-http-client` - For IPFS artifact verification

## Non-Goals (v1)

- No user accounts/auth (publisher=pubkey)
- No multi-sig thresholds
- No ABI/interface schemas
- No mutable updates (use new version instead)
