# SSApp Registry Backend

A minimal SSApp registry backend built with Node.js and Fastify, implementing the OpenAPI 3.0 specification for SSApp management.

## Features

- **OpenAPI 3.0 Integration**: Full API documentation with Swagger UI
- **JCS Canonicalization**: JSON Canonicalization Scheme for deterministic signing
- **Ed25519 Verification**: Cryptographic signature verification
- **IPFS Integration**: WASM artifact storage on IPFS
- **SemVer Support**: Semantic versioning with immutability guarantees
- **CORS & CDN Headers**: Production-ready caching and cross-origin support

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The server will start on `http://localhost:8080` with API documentation available at `/docs`.

### Production

```bash
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGIN` | `http://localhost:3000,https://registry.example.com` | CORS origins |
| `IPFS_GATEWAYS` | Multiple gateways | IPFS gateway URLs |

## API Endpoints

### Health Check
- `GET /healthz` - Returns `{status: "ok"}`

### Apps
- `GET /apps` - List apps (with optional filtering)
- `GET /apps/{pubkey}/{app_name}` - List app versions
- `GET /apps/{pubkey}/{app_name}/{semver}` - Get specific version manifest
- `POST /apps` - Register new app version

### Developers
- `GET /developers/{pubkey}` - Get developer profile
- `POST /developers` - Register developer profile

### Attestations
- `GET /attestations/{pubkey}/{app_name}/{semver}` - Get registry attestations
- `POST /attestations` - Create attestation

## Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Manifest Schema

The app manifest follows this structure:

```json
{
  "manifest_version": "1.0",
  "app": {
    "name": "app-name",
    "developer_pubkey": "ed25519-pubkey",
    "id": "app-id",
    "alias": "com.example.app"
  },
  "version": {
    "semver": "1.0.0"
  },
  "supported_chains": ["chain1", "chain2"],
  "permissions": [
    {
      "cap": "permission-name",
      "bytes": 1024
    }
  ],
  "artifacts": [
    {
      "type": "wasm",
      "target": "wasm32-unknown-unknown",
      "cid": "Qm...",
      "size": 1024,
      "mirrors": ["https://..."]
    }
  ],
  "metadata": {},
  "distribution": "ipfs",
  "signature": {
    "alg": "Ed25519",
    "sig": "base64-signature",
    "signed_at": "2023-01-01T00:00:00Z"
  }
}
```

## Identity Format

Apps are identified using the format: `ssapp:<ed25519-pubkey>/<app_name>`

## Security

- All manifests must be signed with Ed25519
- Signatures are verified against JCS-canonicalized JSON
- SemVer immutability is enforced (same pubkey/name/semver must have same artifact CIDs)
- Public keys are validated for proper format (base58 or multibase)

## Development

### Project Structure

```
src/
├── server.js          # Main server file
├── config.js          # Configuration
├── lib/
│   └── verify.js      # JCS + Ed25519 verification
├── schemas/
│   └── manifest.js    # JSON schema for manifests
└── routes/
    ├── apps.js        # App endpoints
    ├── developers.js  # Developer endpoints
    └── attestations.js # Attestation endpoints
```

### Adding New Endpoints

1. Create route file in `src/routes/`
2. Register in `src/server.js`
3. Add tests in `tests/`
4. Update OpenAPI spec if needed

## License

MIT 