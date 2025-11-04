# Registry API Format Standard

**Date:** November 4, 2025  
**Status:** ✅ FINAL - ALL TESTS PASSING

---

## Standard API Format: PATH-BASED

The Calimero Registry uses **PATH-BASED** API endpoints as the primary format.

### Endpoints

```
GET /api/apps/:id               → Get versions for an app
GET /api/apps/:id/:version      → Get manifest for a specific version
```

### Examples

```bash
# Get versions
curl https://mero-registry.vercel.app/api/apps/network.calimero.meropass

# Get manifest
curl https://mero-registry.vercel.app/api/apps/network.calimero.meropass/0.1.1
```

---

## Backward Compatibility

Query parameter format is **also supported** for backward compatibility:

```
GET /api/apps?id=:id&versions=true         → Get versions
GET /api/apps?id=:id&version=:version      → Get manifest
```

### Examples

```bash
# Get versions
curl 'https://mero-registry.vercel.app/api/apps?id=network.calimero.meropass&versions=true'

# Get manifest
curl 'https://mero-registry.vercel.app/api/apps?id=network.calimero.meropass&version=0.1.1'
```

---

## Implementation

### Production Registry (Vercel)

Files:

- `api/apps/[id].js` - Path-based versions endpoint
- `api/apps/[id]/[version].js` - Path-based manifest endpoint
- `api/apps.js` - Query parameter support (backward compat)

### Local Registry (CLI)

File: `packages/cli/src/lib/local-server.ts`

Supports **both formats** natively:

```typescript
// Path-based
this.server.get('/apps/:appId', async request => {
  const { appId } = request.params;
  // ...
});

// Query-based
this.server.get('/apps', async request => {
  const { id, versions, version } = request.query;
  if (id && versions === 'true') {
    // Return versions
  }
  if (id && version) {
    // Return manifest
  }
  // Otherwise, list all apps
});
```

### Client (Registry Client)

File: `auth-frontend/src/utils/registryClient.ts`

Uses **path-based format**:

```typescript
async getPackageVersions(packageId: string): Promise<string[]> {
  const url = `${this.baseUrl}/apps/${packageId}`;
  // ...
}

async getManifest(packageId: string, version: string): Promise<RegistryManifest> {
  const url = `${this.baseUrl}/apps/${packageId}/${version}`;
  // ...
}
```

---

## Test Results

All tests passing:

```
✅ Backend: 134 passed, 3 skipped, 10 suites
✅ CLI: 12 passed, 2 suites
✅ Client: 2 passed
✅ Frontend: 2 passed
```

---

## Decision Rationale

### Why Path-Based?

1. **RESTful Convention**: Path-based is more RESTful and follows standard HTTP API design
2. **Cleaner URLs**: Easier to read and understand
3. **Better Caching**: CDNs and browsers cache path-based URLs better
4. **Original Design**: This was the original format before the accidental change

### Why Support Query Parameters?

1. **Backward Compatibility**: Existing integrations may still use query params
2. **Zero Breakage**: Both formats work, so no code breaks
3. **Flexibility**: Allows gradual migration if needed

---

## Migration Guide

If you have code using query parameters, you can migrate to path-based:

### Before (Query Parameters)

```typescript
const url = `${baseUrl}/apps?id=${appId}&versions=true`;
```

### After (Path-Based)

```typescript
const url = `${baseUrl}/apps/${appId}`;
```

**Note:** No need to migrate immediately - both formats work!

---

## Vercel Configuration

The Vercel registry uses dynamic routes (`[id]` and `[version]`) to handle path parameters:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    }
  ]
}
```

Vercel automatically maps:

- `/api/apps/[id]` → `req.query.id`
- `/api/apps/[id]/[version]` → `req.query.id` and `req.query.version`

---

## Testing

### Test Path-Based API

```bash
# Vercel Production
curl https://mero-registry.vercel.app/api/apps/network.calimero.meropass
curl https://mero-registry.vercel.app/api/apps/network.calimero.meropass/0.1.1

# Local Registry
curl http://localhost:8082/apps/network.calimero.meropass
curl http://localhost:8082/apps/network.calimero.meropass/0.1.1
```

### Test Query Parameter API (Backward Compat)

```bash
# Vercel Production
curl 'https://mero-registry.vercel.app/api/apps?id=network.calimero.meropass&versions=true'
curl 'https://mero-registry.vercel.app/api/apps?id=network.calimero.meropass&version=0.1.1'

# Local Registry
curl 'http://localhost:8082/apps?id=network.calimero.meropass&versions=true'
curl 'http://localhost:8082/apps?id=network.calimero.meropass&version=0.1.1'
```

---

## Future Considerations

1. **API Versioning**: If we change the format again, use `/api/v2/` prefix
2. **Deprecation**: If we ever want to remove query param support, announce 6 months in advance
3. **Documentation**: Always document the primary format (path-based) in user-facing docs

---

## References

- Vercel Registry: https://mero-registry.vercel.app
- Local Registry: `pnpm --filter registry-cli local start`
- Client Implementation: `auth-frontend/src/utils/registryClient.ts`

---

**Status:** ✅ Stable - All systems operational  
**Last Updated:** November 4, 2025
