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
│   └── cli/              # calimero-registry CLI
├── scripts/              # Dev/test utility scripts
└── .github/              # GitHub Actions workflows
```

| Package                         | Description                                | Stack                    |
| ------------------------------- | ------------------------------------------ | ------------------------ |
| [backend](./packages/backend)   | API server, signature validation, Redis KV | Fastify, Node.js         |
| [frontend](./packages/frontend) | Web UI - browse, upload, org management    | React, TypeScript, Vite  |
| [cli](./packages/cli)           | Org management, metadata edits             | TypeScript, Commander.js |

Apps are built and published with [`cargo mero`](https://github.com/calimero-network/core/tree/master/tools/cargo-mero), which lives in the `core` repo. Nothing in this monorepo builds bundles.

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

Apps are distributed as `.mpk` files - gzip-compressed tar archives. A single-service app keeps its wasm at the root; a workspace shipping several services puts each under `services/`:

```
bundle.mpk                        bundle.mpk  (multi-service)
├── manifest.json                 ├── manifest.json
├── app.wasm                      └── services/
└── abi.json                          ├── registry.wasm
                                      ├── registry-abi.json
                                      ├── docs.wasm
                                      └── docs-abi.json
```

Every service carries its own ABI, and the ABI is also embedded in the wasm as the `calimero_abi_v1` custom section, which is what a node reads to plan a state migration on upgrade.

### Publish workflow

Bundle metadata comes from a `[package.metadata.calimero]` table in the app's `Cargo.toml`, so there is no `manifest.json` to hand-write.

```
1. cargo mero key generate -o key.json          # one-time, keep it out of git

2. cargo mero bundle --key key.json --bump patch
   # → compiles every service to wasm32, embeds the ABI, size-optimizes
   # → writes and signs manifest.json, packs dist/<package>-<version>.mpk
   # → --bump asks the registry for the highest published version

3. export CALIMERO_API_KEY=<token>              # Organizations page → CLI Access
   cargo mero publish dist/<package>-<version>.mpk
   # → POST /api/v2/bundles/push
   # → registry validates the Ed25519 signature and the signer's ownership
   # → app visible in the UI
```

For CI, bumping the version in `Cargo.toml` is the release; see [PUBLISHING.md](PUBLISHING.md).

### Signature verification

Every manifest is verified using:

1. Remove `signature` and all `_*`-prefixed fields
2. RFC 8785 (JCS) canonicalize → deterministic JSON bytes
3. SHA-256 hash of canonical bytes
4. Ed25519 verify(sig, hash, pubkey)

The same process runs on the node side when the Calimero Desktop app installs a bundle.

---

## Ownership and publishing rights

There are two push endpoints, and they do not authorize the same way:

| Endpoint                         | Used by                                   | Authorization for an existing package                                                                           |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/v2/bundles/push`      | `cargo mero publish`, `calimero-registry` | Signing key matches the package's signer. A key in `owners[]` is also accepted, but **do not use it**&nbsp;[^1] |
| `POST /api/v2/bundles/push-file` | Browser upload                            | The above, **or** the uploader's email is in the org linked to the package                                      |

Both require a valid Ed25519 signature, and both refuse the well-known dev key. `push-file` additionally rejects a version that is not greater than the latest published one; `push` leaves version ordering to the caller, which is why `cargo mero bundle --bump` exists.

The rest is common ground. Both push endpoints gate ownership behind `versions.length > 0`, so neither applies it - nor `push-file`'s increasing-version rule - to a package's first version. Deleting is a third endpoint again:

| Scenario       | Endpoint                                     | Authorization                                                                  |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| First publish  | either push endpoint                         | Any signed request. The account behind the token or session becomes the author |
| Delete version | `DELETE /api/v2/bundles/<package>/<version>` | Signed in as `metadata.author` (or `_ownerEmail`)                              |
| Delete package | `DELETE /api/v2/bundles/<package>`           | The same, for every version at once                                            |

`metadata.author` is set server-side on first publish and carried forward from the oldest version onto every later one, so a manifest cannot set or change it.

A delete takes effect immediately, but `GET /api/v2/bundles` is cached at the CDN and nothing purges it, so a listing can trail the registry by up to a minute - long enough for a deleted package to look like it survived. Add `fresh=1` when a read has to reflect a write that just happened; the site does this automatically for a while after any change you make.

[^1]:
    `owners[]` predates the identity model below and `cargo mero` never writes it.
    A key listed there does publish: the endpoint accepts it and stores the version. `ApplicationId` comes from `package` and `signerId`, so that version belongs to a different application, which no node with the original installed will ever see.

### App identity is package + signer

A node derives an app's `ApplicationId` from `SHA-256(borsh(package, signerId))`, not from the wasm.
Publishing the same package under a different key produces a **different application**, not an upgrade, and existing installs never see it.
That is what the signer pin above protects: the registry refuses the mismatch rather than letting the identity break silently.

---

## Organizations

Organizations let teams collectively manage packages. Members are identified by **email address**, so there are no shared keys to distribute or rotate. Browser org management uses your Google session. CLI org management uses an API token.

```
admin@example.com creates org → adds alice@example.com (member)
                              → links com.my-org.app to org

alice@example.com uploads a new version from the browser:
  → bundle signed with the package's signing key
  → session resolves → alice@example.com
  → registry: is alice@example.com in org members? YES → 201 Created

Admin removes alice:
  → registry: is alice@example.com in org members? NO → 403 Forbidden (immediate)
```

Org membership decides **who may operate the package's registry entry**. It does not decide what signs the bundle, and the two are not interchangeable: `ApplicationId` is derived from `package` and `signerId`, so a member uploading under their own key mints a different application rather than a new version, which the registry accepts and no existing install ever sees.

So a package has one signing key, and the org governs who may use it. Hold it as an organization secret (`MERO_SIGN_KEY`) and let a **bot account** publish with it, which keeps releases off any individual's credentials. Membership is still what you revoke: removing someone stops them uploading immediately, with no key rotation, which is the property a shared key on its own does not give you.

### Getting started with orgs

1. **Sign in** with Google at the registry web UI
2. **Create an org** from the Organizations page, where you become the admin
3. **Get a CLI API token** from the Organizations page → CLI Access section:
   ```bash
   calimero-registry config set api-key <token>
   # or: export CALIMERO_API_KEY=<token>
   ```
4. **Add members** by email from the web UI or CLI
5. **Link packages** from the web UI or CLI (must be the original package author or org admin)
6. **Members upload bundles** signed with their own key, and the registry checks their email against the org

### Org CLI commands

All write operations require an API token (set via `config set api-key` or `CALIMERO_API_KEY`):

```bash
# List your orgs (resolves your email from the token automatically)
calimero-registry org list

# Create
calimero-registry org create -n "My Org" -s "my-org"

# Members — add/remove by email
calimero-registry org members add    <org-id> alice@example.com --role member
calimero-registry org members remove <org-id> alice@example.com

# Link packages
calimero-registry org packages link   <org-id> com.my-org.app
calimero-registry org packages unlink <org-id> com.my-org.app
```

---

## CLI reference

Building and publishing is `cargo mero`:

```bash
cargo mero new <name>                       # scaffold an app
cargo mero build                            # compile to wasm32, embed the ABI
cargo mero test                             # node-free test suite
cargo mero bundle --key <file> [--bump patch|minor|major]
cargo mero publish <mpk>                    # needs CALIMERO_API_KEY
cargo mero key generate -o <file>
cargo mero key derive-signer-id -k <file>
cargo mero sign <manifest.json> --key <file>
```

`calimero-registry` covers what talks to the registry rather than to your app:

```bash
# Bundle commands
calimero-registry bundle edit   <package> <version> --remote [--manifest signed.json]
calimero-registry bundle get    <package> <version> --local
calimero-registry bundle push   <bundle-file> [--local | --remote]
calimero-registry bundle create <wasm-file> [package] [version] [options]

# Org commands (require CALIMERO_API_KEY or config api-key)
calimero-registry org list
calimero-registry org create -n <name> -s <slug>
calimero-registry org get <org-id>                                      # public
calimero-registry org update <org-id> [--name <name>] [--metadata <json>]
calimero-registry org delete <org-id>
calimero-registry org members list   <org-id>                           # public
calimero-registry org members add    <org-id> <email> [--role member|admin]
calimero-registry org members update <org-id> <email> --role member|admin
calimero-registry org members remove <org-id> <email>
calimero-registry org packages link   <org-id> <package>
calimero-registry org packages unlink <org-id> <package>

# Config
calimero-registry config set registry-url <url>
calimero-registry config set api-key <token>
```

Environment variables: `CALIMERO_REGISTRY_URL`, `CALIMERO_API_KEY`.

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

- The bundle format and the manifest, single- and multi-service
- The `cargo mero` workflow, from scaffold to published bundle
- Signing keys, `signerId` derivation, and why app identity is package + signer
- Publishing from the terminal, from the browser, and from CI
- Organizations: setup, membership, bot accounts, package linking, revocation
- Registry CLI reference for org administration and metadata edits
- Installation and signature validation on a node

---

## Links

- [Official docs](https://docs.calimero.network)
- [Publishing guide](PUBLISHING.md) - building, signing, and releasing from CI
- [cargo mero](https://github.com/calimero-network/core/tree/master/tools/cargo-mero) - the app toolchain
- [GitHub](https://github.com/calimero-network/app-registry)
- [Issues](https://github.com/calimero-network/app-registry/issues)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE.md)

---

Built by the Calimero Network team.
