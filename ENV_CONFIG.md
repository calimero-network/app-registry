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

# Development/Testing
SEED_TEST_APPS=true         # Seed test apps on startup (default: true in dev, false in prod)
LOG_LEVEL=info              # Logging level (debug, info, warn, error)

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
