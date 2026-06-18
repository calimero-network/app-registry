# Environment Configuration

## Available Environment Variables

### Backend Configuration

```bash
# Server Configuration
PORT=8080                    # Server port (default: 8080)
HOST=0.0.0.0                 # Server host (default: 0.0.0.0)
NODE_ENV=production         # Environment (development/production)

# Storage (Production Required)
REDIS_URL=redis://...       # Redis connection URL (required in production)
VERCEL=1                    # Set automatically by Vercel (enables Redis)

# Bundle binary storage — Google Cloud Storage (GCS)
# Raw .mpk bundle blobs are stored in a GCS bucket (not Redis). Manifests,
# indexes and counters stay in Redis. Objects are written to {GCS_PREFIX}/{package}/{version}.mpk
GCS_BUCKET=calimero-app-registry  # Bucket name (required to read/write binaries)
GCS_PREFIX=bundles                # Object key prefix (default: bundles)
GCS_PROJECT_ID=                   # GCP project id (optional if inferable from creds)
# Service-account credentials. On Vercel (no key file on disk) use inline creds:
GCS_CLIENT_EMAIL=                 # service-account email
GCS_PRIVATE_KEY=                  # service-account private key (PEM; \n-escaped newlines OK)
# Or, for local/ADC, leave the two above empty and set:
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Development/Testing
SEED_TEST_APPS=true         # Seed test apps on startup (default: true in dev, false in prod)
LOG_LEVEL=info              # Logging level (debug, info, warn, error)

# Bundle overwrite (server-only; client _overwrite is ignored for security)
ALLOW_BUNDLE_OVERWRITE=false # If true/1, push can overwrite existing package@version (migrations only; keep false in production)

# CORS Configuration
CORS_ORIGIN=http://localhost:1420,https://app.calimero.network

# IPFS Configuration (optional)
IPFS_GATEWAYS=https://ipfs.io/ipfs/,https://gateway.pinata.cloud/ipfs/
```

### Frontend Configuration

```bash
# Vite dev server port (default: 3000)
VITE_PORT=3000

# Backend API proxy target (default: http://localhost:8080)
VITE_API_PROXY=http://localhost:8080

# Production API URL (default: /api)
VITE_API_URL=/api
```

---

## Usage Examples

### Default Configuration (No env file needed)

```bash
pnpm dev:all
# Backend: http://localhost:8080
# Frontend: http://localhost:3000
```

### Custom Ports

Create `.env.local`:

```bash
PORT=9000
VITE_PORT=4000
VITE_API_PROXY=http://localhost:9000
```

Then run:

```bash
pnpm dev:all
# Backend: http://localhost:9000
# Frontend: http://localhost:4000
```

### Local Development with Real Redis

Create `.env.development.local`:

```bash
REDIS_URL=redis://default:***@***.upstash.io:6379
```

---

## Production (Vercel)

Vercel automatically sets:

- `REDIS_URL` - When you add Marketplace Redis integration
- All other variables use defaults or are set in `vercel.json`

Set manually in the Vercel project env for bundle binary storage:

- `GCS_BUCKET`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY` (and
  optionally `GCS_PREFIX`). Without these, publishing/serving bundle binaries fails.
