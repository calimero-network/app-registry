# Registry Changes Summary

## Branch: `feat/multi-version-wasm`

---

## ✅ Completed Changes

### 1. Removed Render.com Configuration

**Deleted:**

- `render.yaml` - Render service configuration
- `.github/workflows/deploy-backend-render.yml` - Render deployment workflow

**Reason:** Now using Vercel exclusively for all deployments (frontend + backend serverless functions).

---

### 2. Multi-Version WASM Support

**Added Helper Scripts:**

#### `scripts/submit-new-version.sh`

Interactive helper that guides you through submitting a new version:

- Calculates SHA256 digest
- Shows manifest template
- Provides step-by-step instructions

**Usage:**

```bash
./scripts/submit-new-version.sh meropass.wasm network.calimero.meropass 0.2.0
```

####`scripts/upload-and-submit.sh`
Complete automated flow:

- Uploads WASM to GitHub Releases
- Generates manifest automatically
- Submits to registry

**Usage:**

```bash
./scripts/upload-and-submit.sh \
  meropass.wasm \
  network.calimero.meropass \
  "MeroPass - Password Vault" \
  0.2.0 \
  '["password.vault@1"]' \
  '[]'
```

---

### 3. Documentation

**Added:** `MULTI_VERSION_WASM.md`

Comprehensive guide covering:

- How multi-version WASM works
- Storage model explanation
- Step-by-step submission process
- Real examples with MeroPass
- Best practices
- Version comparison strategies

---

## 🎯 Key Features Now Available

### Multi-Version WASM

✅ **Each version has its own WASM**

```
v0.1.0 → app-v0.1.0.wasm (digest: abc123...)
v0.2.0 → app-v0.2.0.wasm (digest: def456...)
```

✅ **Independent artifacts**

- Different SHA256 digests
- Different download URLs
- Immutable once published

✅ **Version history**

- Frontend shows all versions
- Each version clickable
- Artifact details per version

---

## 🧪 Testing Multi-Version WASM

### Example: Submit MeroPass v0.2.0 with Different WASM

```bash
cd /path/to/meropass
pnpm logic:build

# Upload and submit in one command
./scripts/upload-and-submit.sh \
  logic/res/meropass.wasm \
  network.calimero.meropass \
  "MeroPass - Password Vault" \
  0.2.0 \
  '["password.vault@2","secret.manager@1"]' \
  '[]'
```

**Result:**

- v0.1.0, v0.1.1, and v0.2.0 all coexist
- Each has its own WASM file
- Users can download any version
- Frontend shows all versions

---

## 📊 Current State

### Production Registry

**URL:** https://mero-registry.vercel.app

**Apps:** 1 (MeroPass)
**Total Versions:** 2

- network.calimero.meropass@0.1.0
- network.calimero.meropass@0.1.1

### Storage

- **Backend:** Vercel Serverless Functions
- **Database:** Vercel KV (Upstash Redis)
- **Artifacts:** GitHub Releases

---

## 🚀 Next Steps

1. **Test multi-version workflow:**
   - Build a new meropass WASM
   - Use `upload-and-submit.sh` to publish v0.2.0
   - Verify frontend shows 3 versions

2. **Enhance frontend:**
   - Add "Download WASM" button per version
   - Show artifact size
   - Highlight latest version

3. **Add comparison API:**
   - `/api/compare?id=xxx&v1=0.1.0&v2=0.2.0`
   - Shows digest differences
   - Shows size deltas

---

## 📝 Files Changed

```
Deleted:
  - render.yaml
  - .github/workflows/deploy-backend-render.yml

Added:
  - scripts/submit-new-version.sh
  - scripts/upload-and-submit.sh
  - MULTI_VERSION_WASM.md
  - CHANGES_SUMMARY.md
```

**All tests passing:** ✅  
**Ready to merge:** ✅

---

**Branch:** `feat/multi-version-wasm`  
**Created:** 2025-11-04  
**Status:** Ready for review
