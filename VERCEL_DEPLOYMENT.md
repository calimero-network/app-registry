# Vercel Deployment Guide

## ✅ Migration Complete

The registry has been successfully migrated to work with Vercel!

### What Changed

1. **Storage Layer**: Switched from in-memory storage to Vercel KV (Redis)
2. **API Functions**: Created serverless functions in `/api` directory
3. **Frontend**: Updated to serve from root path `/` instead of `/app-registry/`
4. **Configuration**: Added `vercel.json` for deployment settings

---

## 📁 Project Structure

```
registry/
├── api/                              # Serverless API functions
│   ├── healthz.js                   # GET /api/healthz
│   ├── stats.js                     # GET /api/stats
│   ├── apps.js                      # GET /api/apps
│   └── v1/
│       └── apps/
│           ├── index.js             # POST /api/v1/apps
│           ├── [id].js              # GET /api/v1/apps/:id
│           └── [id]/
│               └── [version].js     # GET /api/v1/apps/:id/:version
│
├── packages/
│   ├── frontend/                    # React app (deployed to CDN)
│   │   └── dist/                    # Build output
│   └── backend/
│       └── src/lib/
│           ├── kv-client.js         # KV wrapper (mock/real)
│           └── v1-storage-kv.js     # KV storage implementation
│
├── vercel.json                      # Vercel configuration
└── .vercelignore                    # Files to ignore in deployment
```

---

## 🚀 Deployment Steps

### 1. **Connect to Vercel**

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Link project to Vercel
cd /Users/xilosada/dev/calimero/registry
vercel link
```

### 2. **Add Redis from Vercel Marketplace**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Storage** tab
4. Browse **Marketplace**
5. Select **Upstash Redis** (or another Redis provider)
6. Click **Add Integration**
7. Authorize and connect

Vercel will automatically add this environment variable:

```
REDIS_URL=redis://default:***@***.upstash.io:6379
```

### 3. **Deploy**

```bash
# Deploy to production
vercel --prod
```

Or push to GitHub and connect repository in Vercel dashboard for automatic deployments.

---

## 🔧 Local Development

### Start Development Server

```bash
# Install dependencies
pnpm install

# Start frontend dev server (with API proxy)
pnpm dev:frontend

# Frontend will run on http://localhost:3000
# API calls to /api/* will be proxied to mock KV storage
```

### Test API Functions Locally

```bash
# Test health check
node -e "const fn = require('./api/healthz.js'); fn({}, {status: (c) => ({json: (d) => console.log(c, d)})})"

# Test stats endpoint
node -e "const fn = require('./api/stats.js'); fn({}, {status: (c) => ({json: (d) => console.log(c, d)})})"
```

### Local vs Production

- **Local Development**: Uses mock in-memory KV store
- **Production**: Uses real Vercel KV (Redis)

Detection is automatic via `process.env.VERCEL` environment variable.

---

## 📊 Key Files

### `vercel.json`

- Configures build and deployment settings
- Sets up rewrites for SPA routing
- Configures CORS headers
- Pins the functions to `fra1` (Frankfurt), the region Redis runs in
  (Redis Cloud, `eu-central-1`). A request waits on several Redis round
  trips in a row, so the functions must sit beside Redis: on Vercel's
  default `iad1` each trip crossed the Atlantic. If Redis ever moves, move
  `regions` with it.

### `packages/backend/src/lib/kv-client.js`

- Wrapper for Vercel KV
- Provides mock storage for local dev
- Auto-detects production vs development
- The only Redis client: `api/lib/kv-client.js` re-exports it, so each
  function instance opens one connection

### `packages/backend/src/lib/v1-storage-kv.js`

- Storage implementation using KV
- Same interface as original V1Storage
- Persistent across deployments

---

## 🔍 API Endpoints

All endpoints are available at your Vercel domain:

```
https://your-project.vercel.app/api/healthz
https://your-project.vercel.app/api/stats
https://your-project.vercel.app/api/apps
https://your-project.vercel.app/api/v1/apps
https://your-project.vercel.app/api/v1/apps/:id
https://your-project.vercel.app/api/v1/apps/:id/:version
```

---

## 🧪 Testing After Deployment

### 1. Health Check

```bash
curl https://your-project.vercel.app/api/healthz
# Expected: {"status":"ok","timestamp":"..."}
```

### 2. Stats

```bash
curl https://your-project.vercel.app/api/stats
# Expected: {"publishedApps":0,"activeDevelopers":0,...}
```

### 3. Submit a Manifest

```bash
curl -X POST https://your-project.vercel.app/api/v1/apps \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_version": "1.0",
    "id": "com.example.test",
    "name": "Test App",
    "version": "1.0.0",
    "chains": ["near:testnet"],
    "artifact": {
      "type": "wasm",
      "target": "node",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "uri": "https://example.com/test.wasm"
    }
  }'
# Expected: {"id":"com.example.test","version":"1.0.0","canonical_uri":"/v1/apps/..."}
```

### 4. Get App Versions

```bash
curl https://your-project.vercel.app/api/v1/apps/com.example.test
# Expected: {"id":"com.example.test","versions":["1.0.0"]}
```

---

## 💾 Vercel KV Limits

### Free Tier

- **Storage**: 256 MB
- **Requests**: 30,000 commands/month (~1,000/day)
- **Bandwidth**: 1 GB/month

### Pro Tier ($20/month)

- **Storage**: 512 MB
- **Requests**: 100,000 commands/month
- **Bandwidth**: 10 GB/month

**Estimate for Registry:**

- ~100 apps × 3 versions = 300 manifests
- ~2 KB per manifest = 600 KB total storage
- ~1,000 reads/day typical usage

✅ **Free tier is sufficient for now**

---

## 🔐 Environment Variables

### Automatically Set by Marketplace Redis

```
REDIS_URL=redis://default:***@***.upstash.io:6379
```

### Optional (Set in Vercel Dashboard)

```
NODE_ENV=production
```

---

## 🐛 Troubleshooting

### "Module not found" errors

- Check that `vercel.json` `outputDirectory` points to `packages/frontend/dist`
- Verify `buildCommand` is `pnpm build:frontend`

### API functions not working

- Check function logs in Vercel dashboard
- Verify KV environment variables are set
- Test locally first with mock KV

### CORS errors

- Check `vercel.json` headers configuration
- Verify frontend is making requests to `/api/*`

### Frontend 404 errors

- Verify `base: '/'` in `vite.config.ts`
- Check `basename='/'` in `main.tsx`
- Ensure `outputDirectory` is correct

---

## 📈 Monitoring

### Vercel Dashboard

- **Analytics**: View traffic and performance
- **Logs**: Real-time function logs
- **Speed Insights**: Frontend performance

### KV Dashboard

- **Storage Usage**: Monitor data size
- **Command Usage**: Track API calls
- **Keys**: Browse stored data

---

## 🎯 Next Steps

1. ✅ Deploy to Vercel
2. ✅ Verify all endpoints work
3. ✅ Test with real manifests
4. 📱 Connect frontend to production API
5. 🔒 Add authentication if needed
6. 📊 Set up monitoring alerts
7. 🚀 Announce new registry URL

---

## 🔗 Useful Links

- [Vercel Dashboard](https://vercel.com/dashboard)
- [Vercel KV Docs](https://vercel.com/docs/storage/vercel-kv)
- [Vercel Functions Docs](https://vercel.com/docs/functions)

---

**Deployment Date**: November 4, 2025
**Migration Completed**: ✅ Ready for production
