# Multi-Version WASM Support

The Calimero Registry fully supports **different WASM binaries for each version** of an app.

---

## ✅ How It Works

### Storage Model

Each manifest is stored with its own artifact:

```
manifest:{app-id}/{version} → {
  json: {...},
  artifact_digest: "sha256:abc123...",
  artifact_uri: "https://github.com/.../v1.0.0/app.wasm",
  created_at: "2025-11-04T..."
}
```

**This means:**

- ✅ Version 0.1.0 can have `app-v0.1.0.wasm`
- ✅ Version 0.2.0 can have `app-v0.2.0.wasm` (completely different binary)
- ✅ Each version has its own SHA256 integrity check
- ✅ Versions are independent

---

## 🚀 Submitting New Versions

### Option 1: Automated Script (Recommended)

Use the complete workflow script:

```bash
./scripts/upload-and-submit.sh \
  path/to/myapp-v2.wasm \
  network.calimero.myapp \
  "My App Name" \
  0.2.0 \
  '["interface.name@1"]' \
  '[]'
```

**This script will:**

1. Calculate SHA256 digest
2. Upload WASM to GitHub Releases
3. Generate manifest with correct URI
4. Submit to registry

### Option 2: Manual Process

#### Step 1: Build new WASM

```bash
cd your-app/logic
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/your_app.wasm ./res/your-app-v0.2.0.wasm
```

#### Step 2: Calculate digest

```bash
shasum -a 256 your-app-v0.2.0.wasm
# Output: abc123def456...
```

#### Step 3: Upload to GitHub

```bash
gh release create network.calimero.myapp-v0.2.0 \
  --repo calimero-network/app-registry \
  --title "My App v0.2.0" \
  --notes "Version 0.2.0 release notes" \
  your-app-v0.2.0.wasm
```

#### Step 4: Create manifest

```json
{
  "manifest_version": "1.0",
  "id": "network.calimero.myapp",
  "name": "My App",
  "version": "0.2.0",
  "chains": ["near:testnet", "near:mainnet"],
  "artifact": {
    "type": "wasm",
    "target": "node",
    "digest": "sha256:abc123def456...",
    "uri": "https://github.com/calimero-network/app-registry/releases/download/network.calimero.myapp-v0.2.0/your-app-v0.2.0.wasm"
  },
  "provides": ["your.interface@1"],
  "requires": [],
  "dependencies": []
}
```

#### Step 5: Submit

```bash
curl -X POST https://mero-registry.vercel.app/api/v1/apps \
  -H "Content-Type: application/json" \
  -d @manifest-v0.2.0.json
```

---

## 🔍 Viewing Version-Specific WASMs

### API

```bash
# Get all versions
curl "https://mero-registry.vercel.app/api/apps?id=network.calimero.myapp&versions=true"

# Get specific version manifest
curl "https://mero-registry.vercel.app/api/apps?id=network.calimero.myapp&version=0.1.0"
curl "https://mero-registry.vercel.app/api/apps?id=network.calimero.myapp&version=0.2.0"

# Each returns its own artifact.uri and artifact.digest
```

### Frontend

Visit the app detail page:

```
https://mero-registry.vercel.app/apps/network.calimero.myapp
```

The page shows:

- **Latest version** artifact in "App Details" section
- **All versions** in "Version History" section
- Click a version to see its specific WASM

---

## 🎯 Real-World Example: MeroPass

**MeroPass has 2 versions:**

### Version 0.1.0

```json
{
  "version": "0.1.0",
  "artifact": {
    "digest": "sha256:ee5e4acfe2a86a79c65f6073e64b5c6b7f5399083439b8ac6bb0c2907b7a43da",
    "uri": "https://github.com/calimero-network/calimero/releases/download/v0.1.0/meropass.wasm"
  }
}
```

### Version 0.1.1

```json
{
  "version": "0.1.1",
  "artifact": {
    "digest": "sha256:ee5e4acfe2a86a79c65f6073e64b5c6b7f5399083439b8ac6bb0c2907b7a43da",
    "uri": "https://github.com/calimero-network/app-registry/releases/download/meropass-v0.1.0/meropass.wasm"
  }
}
```

**Note:** In this case, both versions point to the same WASM (same digest), but different URIs. In real scenarios, you'd have different WASMs with different digests.

---

## 🧪 Testing Multi-Version WASMs

### Test Case 1: Same App, Different WASMs

```bash
# Build v1
cd myapp/logic
cargo build --release
cp target/.../myapp.wasm ./res/myapp-v1.wasm

# Submit v1
./scripts/upload-and-submit.sh myapp-v1.wasm network.calimero.myapp "MyApp" 1.0.0

# Make changes to code
# Build v2
cargo build --release
cp target/.../myapp.wasm ./res/myapp-v2.wasm

# Submit v2 (different WASM!)
./scripts/upload-and-submit.sh myapp-v2.wasm network.calimero.myapp "MyApp" 2.0.0
```

**Result:**

- v1.0.0 has its WASM with digest X
- v2.0.0 has its WASM with digest Y
- Both coexist in registry
- Users can download either version

### Test Case 2: Verify Integrity Per Version

```bash
# Download v1
curl -sL $(curl -s "https://mero-registry.vercel.app/api/apps?id=network.calimero.myapp&version=1.0.0" | jq -r '.artifact.uri') -o v1.wasm

# Verify v1
shasum -a 256 v1.wasm
# Should match digest from v1 manifest

# Download v2
curl -sL $(curl -s "https://mero-registry.vercel.app/api/apps?id=network.calimero.myapp&version=2.0.0" | jq -r '.artifact.uri') -o v2.wasm

# Verify v2
shasum -a 256 v2.wasm
# Should match digest from v2 manifest (different from v1!)
```

---

## 📊 Version Comparison

### API Endpoint (Future Enhancement)

Compare artifacts between versions:

```bash
curl "https://mero-registry.vercel.app/api/compare?id=network.calimero.myapp&v1=1.0.0&v2=2.0.0"
```

Returns:

```json
{
  "app_id": "network.calimero.myapp",
  "v1": {
    "version": "1.0.0",
    "digest": "sha256:abc...",
    "size": 250000
  },
  "v2": {
    "version": "2.0.0",
    "digest": "sha256:xyz...",
    "size": 300000
  },
  "same_binary": false,
  "size_delta": 50000
}
```

---

## 🎯 Key Benefits

1. **Rollback Support** - Users can downgrade to older WASM if needed
2. **A/B Testing** - Deploy different versions to different users
3. **Migration Path** - Gradual updates across network
4. **Integrity** - Each version has independent SHA256 verification
5. **Immutable** - Once published, version artifacts never change

---

## 🔒 Best Practices

### 1. Never Reuse Digests

Each version SHOULD have a different WASM (different digest). If the WASM is identical, just don't create a new version.

### 2. Naming Convention

```
app-name-v{version}.wasm
meropass-v0.1.0.wasm
meropass-v0.2.0.wasm
```

### 3. GitHub Release Tags

```
{app-id}-v{version}
network.calimero.meropass-v0.1.0
network.calimero.meropass-v0.2.0
```

### 4. Semantic Versioning

- **Patch (0.1.0 → 0.1.1)**: Bug fixes, no API changes
- **Minor (0.1.0 → 0.2.0)**: New features, backward compatible
- **Major (0.1.0 → 1.0.0)**: Breaking changes

---

## 📝 Summary

✅ **Multi-version WASM is fully supported**  
✅ **Each version has independent artifact URI and digest**  
✅ **Helper scripts provided for easy submission**  
✅ **Frontend displays version-specific details**  
✅ **Immutable once published**

**You can submit as many versions as needed, each with its own unique WASM binary!**
