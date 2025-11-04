# Environment Configuration

## Available Environment Variables

### Backend Configuration

```bash
# Server port (default: 8080)
PORT=8080

# Redis connection (auto-set by Vercel in production)
REDIS_URL=redis://default:***@***.upstash.io:6379
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
