# Calimero Registry

[![CI](https://github.com/calimero-network/app-registry/workflows/CI/badge.svg)](https://github.com/calimero-network/app-registry/actions/workflows/basic-ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

A monorepo for the Calimero Registry — a self-sovereign application registry for publishing, discovering, and managing WebAssembly apps that run inside Calimero nodes. Every bundle is cryptographically signed; the registry validates the signature on every upload and nodes re-verify on install.

---

## Monorepo structure

```
app-registry/
├── packages/
│   ├── backend/          # Fastify API server (Redis storage)
│   ├── frontend/         # React + TypeScript web app
│   ├── client-library/   # TypeScript API client
│   └── cli/              # calimero-registry CLI
├── scripts/              # Dev/test utility scripts
└── .github/              # GitHub Actions workflows
```

| Package                                     | Description                                | Stack                    |
| ------------------------------------------- | ------------------------------------------ | ------------------------ |
| [backend](./packages/backend)               | API server, signature validation, Redis KV | Fastify, Node.js         |
| [frontend](./packages/frontend)             | Web UI — browse, upload, org management    | React, TypeScript, Vite  |
| [client-library](./packages/client-library) | TypeScript client for the API              | TypeScript, Axios        |
| [cli](./packages/cli)                       | Bundle create/push/edit, org management    | TypeScript, Commander.js |

---

## Quick start

```bash
# Prerequisites: Node.js 18+, pnpm 8+

git clone https://github.com/calimero-network/app-registry.git
cd app-registry
pnpm install
pnpm build

# Start backend + frontend together
pnpm dev:all
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

---

## How it works

### Bundle format

Apps are distributed as `.mpk` files — gzip-compressed tar archives:

```
bundle.mpk
├── manifest.json   ← metadata + Ed25519 signature
├── app.wasm        ← compiled WebAssembly module
└── abi.json        ← optional ABI schema
```

### Publish workflow

```
1. cargo build --target wasm32-unknown-unknown --release

2. mero-sign generate-key --output key.json          # one-time

3. calimero-registry bundle create app.wasm com.example.myapp 1.0.0 \
     --name "My App" --abi res/abi.json --output dist/myapp
   # → writes dist/myapp/manifest.json + dist/myapp/app.wasm (not packed yet)

4. mero-sign sign dist/myapp/manifest.json --key key.json
   # → adds signature field to manifest.json

5. calimero-registry bundle push dist/myapp --remote
   # → CLI packs files into .mpk on the fly
   # → registry validates Ed25519 signature
   # → stores manifest + binary
   # → app visible in the UI
```

### Signature verification

Every manifest is verified using:

1. Remove `signature` and all `_*`-prefixed fields
2. RFC 8785 (JCS) canonicalize → deterministic JSON bytes
3. SHA-256 hash of canonical bytes
4. Ed25519 verify(sig, hash, pubkey)

The same process runs on the node side when the Calimero Desktop app installs a bundle.

---

## Ownership and publishing rights

Who can push a new version or PATCH metadata for a package:

| Scenario           | Authorization                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| First publish      | Any signed request — signer becomes the owner                                                                                        |
| New version / edit | Signer's pubkey matches original signer, OR pubkey is in `manifest.owners[]`, OR pubkey is a member of the org linked to the package |
| Delete version     | Signed in (Google session) as the `metadata.author` email                                                                            |

`metadata.author` is set server-side from the Google session on first push and cannot be overwritten via edit.

---

## Organizations

Organizations let teams collectively manage packages without sharing a key.

**Each member has their own independent Ed25519 keypair.** The org stores each member's _public key_. The registry checks membership on every manifest submission.

```
Admin A (pubkey: AAA) → creates org → adds Member B (pubkey: BBB)
                     → links com.my-org.app to org

Member B edits com.my-org.app:
  → signs manifest with BBB's key
  → registry: is BBB in org members? YES → 200 OK

Admin A removes B:
  → registry: is BBB in org members? NO  → 403 Forbidden (immediate)
```

### Org CLI commands

All write operations require your org key file (`-k org-key.json`):

```bash
# Create
calimero-registry org -k org-key.json create -n "My Org" -s "my-org"

# Members
calimero-registry org -k org-key.json members <org-id> add <pubkey> --role member
calimero-registry org -k org-key.json members <org-id> remove <pubkey>

# Link packages
calimero-registry org -k org-key.json packages <org-id> link com.my-org.app
```

The org key file can be downloaded from the **Organizations page** in the UI (format is mero-sign-compatible `{ private_key, public_key, signer_id }`).

---

## CLI reference

```bash
# Bundle commands
calimero-registry bundle create <wasm> <package> <version> [options]
calimero-registry bundle push   <dir|file.mpk>  --remote | --local
calimero-registry bundle edit   <package> <version> --remote [--manifest signed.json]
calimero-registry bundle get    <package> <version> --local

# Org commands
calimero-registry org -k <key.json> list
calimero-registry org -k <key.json> create -n <name> -s <slug>
calimero-registry org members <org-id> list                             # public
calimero-registry org -k <key.json> members <org-id> add | remove | update
calimero-registry org -k <key.json> packages <org-id> link | unlink

# Config
calimero-registry config set registry-url <url>
```

Environment variable override: `CALIMERO_REGISTRY_URL`.

---

## Development scripts

```bash
pnpm install          # install all dependencies
pnpm build            # build all packages
pnpm dev:all          # start backend + frontend in parallel
pnpm dev              # backend only
pnpm dev:frontend     # frontend only
pnpm test             # run all tests
pnpm test:coverage    # with coverage report
pnpm lint             # lint all packages
pnpm lint:fix         # auto-fix lint issues
pnpm format           # prettier format
pnpm quality          # lint + test + format check
pnpm quality:fix      # fix all quality issues
```

### Utility scripts

```bash
node scripts/create-mpk-bundle.js    # create a sample test bundle
node scripts/cleanup-registry.js     # remove test data from a running registry

# Standalone signature verification (no server required)
node packages/backend/scripts/verify-signature-standalone.js manifest.json
```

---

## Configuration

```bash
# Backend (.env)
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173

# Frontend (.env)
VITE_API_URL=http://localhost:3000
```

Copy the example files:

```bash
cp packages/backend/.env.example  packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

---

## Testing

```bash
pnpm test                          # all packages
pnpm --filter registry-backend test
pnpm --filter registry-frontend test
pnpm test:coverage
```

---

## In-app documentation

The registry frontend ships a built-in **Docs** page (`/docs`) covering:

- What Calimero apps are and the bundle format
- mero-sign key generation and manifest signing
- Full CLI reference with examples
- Creating and publishing bundles step-by-step
- Testing with local registry and scripts
- Frontend upload and edit flows
- Versioning rules
- Organizations — setup, membership, package linking, revocation
- Installation and signature validation in Calimero Desktop

---

## Links

- [Official docs](https://docs.calimero.network)
- [GitHub](https://github.com/calimero-network/app-registry)
- [Issues](https://github.com/calimero-network/app-registry/issues)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE.md)

---

Built by the Calimero Network team.
