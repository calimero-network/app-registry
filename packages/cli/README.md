# calimero-registry

Command-line access to the Calimero App Registry: organizations, bundle metadata, and a local registry for development.

> **Building and publishing bundles is not this tool's job.** Use [`cargo mero`](https://github.com/calimero-network/core/tree/master/tools/cargo-mero) - `cargo mero bundle` to build and sign, `cargo mero publish` to upload. See [PUBLISHING.md](../../PUBLISHING.md).

## Install

```bash
npm install -g @calimero-network/registry-cli
# or: pnpm add -g @calimero-network/registry-cli
```

From a clone:

```bash
pnpm install && pnpm build && pnpm link
```

## Configuration

Two settings, resolved in this order: command flags, then environment, then the config file at `~/.calimero-registry/remote-config.json`, then the public registry.

```bash
calimero-registry config set registry-url https://apps.calimero.network
calimero-registry config set api-key <token>
calimero-registry config list
calimero-registry config get registry-url
calimero-registry config reset [--force]
```

| Key            | Environment             | Default                         |
| -------------- | ----------------------- | ------------------------------- |
| `registry-url` | `CALIMERO_REGISTRY_URL` | `https://apps.calimero.network` |
| `api-key`      | `CALIMERO_API_KEY`      | none                            |

`registry-url` and `api-key` are the only keys. Get a token from the registry's Organizations page, under **CLI Access**; `cargo mero` reads the same two variables.

## Organizations

The main reason to use this CLI. Every write needs an API token; `org get` and `org members list` are public.

```bash
calimero-registry org list                                  # resolves your email from the token
calimero-registry org create -n "My Org" -s "my-org"        # both flags required
calimero-registry org get    <orgId>                        # id or slug
calimero-registry org update <orgId> [-n <name>] [-m <json>]
calimero-registry org delete <orgId> [-y]                   # irreversible

calimero-registry org members list   <orgId>
calimero-registry org members add    <orgId> <email> [-r admin|member]
calimero-registry org members update <orgId> <email> -r admin|member
calimero-registry org members remove <orgId> <email>

calimero-registry org packages link   <orgId> <package>
calimero-registry org packages unlink <orgId> <package>
```

Members are identified by email, so removing someone takes effect on their next request with no key rotation involved. Linking a package to an org lets any member publish new versions of it **through the browser upload**; a `cargo mero publish` still has to be signed by the key that owns the package. See the [ownership rules](../../README.md#ownership-and-publishing-rights).

## Bundles

```bash
# edit published metadata: fetch with changes applied, sign, then PATCH back
calimero-registry bundle edit <package> <version> --remote \
  [--name <name>] [--description <text>] [--author <author>] \
  [--frontend <url>] [--github <url>] [--docs <url>] \
  [-o <path>]            # where to write the manifest to sign (default manifest.json)
  [--manifest <path>]    # PATCH this already-signed manifest instead
  [--url <registry-url>] [--api-key <key>]

# read a manifest
calimero-registry bundle get <package> <version> [--local]

# push a pre-built .mpk
calimero-registry bundle push <bundle-file> [--local | --remote]

# assemble a bundle from a bare wasm (predates cargo mero)
calimero-registry bundle create <wasm-file> [package] [version] \
  [-o <path>] [--name <name>] [--description <text>] [--author <author>] \
  [--frontend <url>] [--github <url>] [--docs <url>] [--abi <path>]
```

`bundle edit` is a three-step flow, because the registry only accepts a signed manifest:

```bash
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --name "New Name" -o manifest.json     # 1. fetch with changes applied
cargo mero sign manifest.json --key my-key.json   # 2. sign
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --manifest manifest.json               # 3. PATCH back
```

`bundle create` and `bundle push` predate `cargo mero` and know nothing about multi-service bundles, icons, or embedded ABIs. Use them only for a bundle built outside the Rust toolchain; anything built from a Calimero app crate should go through `cargo mero bundle` and `cargo mero publish`.

## Local registry

A file-backed registry for development, storing data under `~/.calimero-registry/`.

```bash
calimero-registry local start [-p <port>] [-h <host>]
calimero-registry local status
calimero-registry local stop

calimero-registry local seed                    # sample data
calimero-registry local reset [-f]
calimero-registry local backup [-o <file>]
calimero-registry local restore <backup-file>
```

Commands that accept `--local` (`bundle get`, `bundle push`) then work against it instead of the remote registry.

## Other

```bash
calimero-registry health                        # check the API is reachable
calimero-registry ipfs upload   <file>
calimero-registry ipfs download <cid> [output]
```

## Development

```bash
pnpm build        # tsup
pnpm test         # vitest
pnpm lint         # eslint, zero warnings
pnpm type-check   # tsc --noEmit
```

## License

MIT. See [LICENSE.md](../../LICENSE.md).
