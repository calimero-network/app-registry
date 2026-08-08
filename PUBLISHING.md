# Publishing to the Calimero App Registry

How an app gets from a Rust crate to a published bundle, by hand and from CI.

Everything here is done with [`cargo mero`](https://github.com/calimero-network/core/tree/master/tools/cargo-mero), which lives in the `core` repo.
It replaces the per-app `build.sh` / `build-bundle.sh` scripts, standalone `mero-sign` invocations, and `calimero-registry bundle create` / `bundle push`.
`calimero-registry` is still the tool for organization administration and metadata edits; it no longer has a role in building bundles.

---

## Prerequisites

```bash
cargo install --git https://github.com/calimero-network/core cargo-mero
rustup target add wasm32-unknown-unknown
```

`cargo mero build` installs the wasm target itself when `rustup` is available, so the second line is only needed on a machine without it.
Prebuilt binaries are attached to each [core release](https://github.com/calimero-network/core/releases); CI should install a pinned one rather than build from git (see [Pinning the toolchain](#pinning-the-toolchain)).

Run `cargo mero guide` at any time for the canonical end-to-end walkthrough.

---

## Describing the app

Bundle metadata comes from a `[package.metadata.calimero]` table in the app's `Cargo.toml`.
There is no `manifest.json` to write or keep in sync: `cargo mero bundle` generates and signs it.

```toml
[package.metadata.calimero]
package = "com.example.my-app"          # required, the app id, immutable once published
name = "My App"
description = "A collaborative example app"
icon = "assets/icon.png"                # read and embedded as a data: URI at bundle time
license = "MIT"
tags = ["social", "chat"]
min-runtime-version = "0.7.0"
frontend = "https://my-app.example.com"
github = "https://github.com/example/my-app"
```

A workspace that ships several wasm services declares them under `[workspace.metadata.calimero]` instead, which also wins over a package table when both are present:

```toml
[workspace.metadata.calimero]
package = "network.calimero.mero-drive"
name = "Mero Drive"
icon = "assets/icon.png"

[[workspace.metadata.calimero.services]]
name = "drive"
crate = "mero-drive-service"

[[workspace.metadata.calimero.services]]
name = "index"
crate = "mero-index-service"
```

The app version is not a metadata key.
It defaults to the crate's `[package] version`, and `--app-version` or `--bump` override it.

---

## Signing keys

Every bundle carries an Ed25519 signature over its manifest.
There are two kinds of key and the choice decides whether the bundle can leave your machine.

| Signing method | What it means                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dev`        | A single well-known key baked into the tool, so every `--dev` bundle everywhere shares one signer. Fine for local installs; proves nothing about provenance. **The registry refuses it.** |
| `--key <file>` | A private key only you hold. Required for anything published.                                                                                                                             |

```bash
cargo mero key generate -o my-key.json
# Generated new keypair: my-key.json
#   signerId: did:key:z6MkrV2imerTHzYtPyb2groFVNJSokGX7rpxnuJj8DSEQDnH

cargo mero key derive-signer-id -k my-key.json   # inspect without signing
```

Keep the key file out of the repository and back it up.
Losing it means you can no longer publish updates under the same app identity, and there is no recovery path.

### App identity is package + signer

A node does not hash the wasm to identify an app.
It derives the `ApplicationId` from `SHA-256(borsh(package, signerId))`.

```
com.example.my-app  +  did:key:z6MkrV2...   →  ApplicationId  A
com.example.my-app  +  did:key:z6MkoWk...   →  ApplicationId  B   (a different app)
```

Publishing an existing package under a different key does not produce an upgrade, it produces a different application that existing installs never see.
The registry pins the signer per package and refuses the mismatch rather than letting the identity break silently.

---

## Publishing by hand

Get an API token from the registry's Organizations page, under **CLI Access**.
It is shown once.

```bash
# 1. build, sign, and pack; --bump asks the registry for the highest published version
cargo mero bundle --key my-key.json --bump patch
# → dist/com.example.my-app-1.2.4.mpk

# 2. publish
export CALIMERO_API_KEY=<token>
cargo mero publish dist/com.example.my-app-1.2.4.mpk
```

`CALIMERO_REGISTRY_URL` overrides the registry, which defaults to `https://apps.calimero.network`.

Useful `bundle` flags:

| Flag                         | Effect                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--bump patch\|minor\|major` | Take the next version from the registry rather than `Cargo.toml`. Mutually exclusive with `--app-version`. |
| `--app-version <v>`          | Set the version explicitly.                                                                                |
| `-o, --output <path>`        | Override `dist/<package>-<appVersion>.mpk`.                                                                |
| `--no-icon`                  | Ship without an icon. Fine when `frontend` is set: the desktop discovers a PWA icon at that URL.           |
| `--no-abi`                   | Omit the ABI. The bundle cannot be migrated.                                                               |
| `--print-output-path`        | Print the built `.mpk` path as the last line, for scripts that would otherwise rebuild the filename.       |
| `--features "a b"`           | Cargo feature flags, forwarded to both the build and the ABI extraction.                                   |

---

## Publishing from CI

Releasing by hand means someone has to remember to do it, with the production key on their laptop.
The pattern below makes bumping the version in `Cargo.toml` the release: merge that to the default branch and CI builds, signs, and publishes.

### Secrets

Set these as **organization secrets** so every app repo inherits them, rather than copying a key into each one.

| Secret                      | Contents                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MERO_SIGN_KEY`             | The full JSON of the production key file. Must be the key that signed the package's first version.           |
| `CALIMERO_REGISTRY_API_KEY` | An API token from the Organizations page. A dedicated bot account keeps releases off a person's credentials. |

### The shape

```
push to the default branch touching logic/Cargo.toml
      │
      ▼  read [workspace.package] version + the calimero package id
      │
      ▼  GET /api/v2/bundles/<package>/<version>
      │     404 → publish        200 → already released, stop
      │     anything else → fail (never republish on a blind guess)
      │
      ▼  install pinned cargo-mero, write the key from the secret
      │
      ▼  derive-signer-id  ==  the package's published signerId?
      │     no → fail before signing anything
      │
      ▼  cargo mero bundle --key ...   →   cargo mero publish
```

### The workflow

```yaml
name: Deploy Bundle

on:
  push:
    branches: [master]
    paths: ['logic/Cargo.toml'] # the version lives here and nowhere else
  workflow_dispatch:

# The registry rejects a duplicate version, so never let two publishes
# interleave. Never cancel in progress: a half-finished publish is worse
# than a queued one.
concurrency:
  group: deploy-bundle
  cancel-in-progress: false

jobs:
  # Cheap gate, so an unrelated edit to Cargo.toml does not pay for a Rust
  # build before deciding to do nothing.
  check:
    runs-on: ubuntu-latest
    outputs:
      publish: ${{ steps.decide.outputs.publish }}
      package: ${{ steps.read.outputs.package }}
      version: ${{ steps.read.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Read the package id and version
        id: read
        working-directory: logic
        run: |
          meta=$(cargo metadata --no-deps --format-version 1)

          # The calimero table sits on the workspace for a multi-service
          # bundle and on the package otherwise; select drops the null from
          # whichever one is absent before first() picks a winner.
          package=$(jq -er 'first((.metadata.calimero.package,
            .packages[].metadata.calimero.package) | select(. != null))
            // error("no calimero package id")' <<<"$meta")

          # Members inherit [workspace.package] version, so one distinct value
          # is the expected case; more than one and this job cannot know which
          # version is about to ship.
          version=$(jq -er '[.packages[].version] | unique
            | if length == 1 then .[0] else error("members disagree: \(.)") end' <<<"$meta")

          # Validate before either value reaches a URL. An empty package makes
          # the check below query .../bundles//, and a 404 on a malformed path
          # reads as "not published" - the blind republish this job prevents.
          case "$package" in
            '' | *[!a-zA-Z0-9.-]*) echo "::error::bad package id '$package'"; exit 1 ;;
          esac
          # A regex, not a glob: in a glob `*` spans dots, so 1.2.3.4 would
          # pass, as would a trailing newline forging a second output entry.
          [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
            echo "::error::version must be X.Y.Z (got '$version')"; exit 1; }

          echo "package=$package" >> "$GITHUB_OUTPUT"
          echo "version=$version" >> "$GITHUB_OUTPUT"

      - id: decide
        env:
          PACKAGE: ${{ steps.read.outputs.package }}
          VERSION: ${{ steps.read.outputs.version }}
        run: |
          # An unreachable registry must not read as "not published": that
          # would republish blind. Only a definite 404 means new.
          code=$(curl -s -o /dev/null -w '%{http_code}' --retry 3 --max-time 30 \
            "https://apps.calimero.network/api/v2/bundles/$PACKAGE/$VERSION" || echo "000")
          case "$code" in
            404) echo "publish=true"  >> "$GITHUB_OUTPUT" ;;
            200) echo "publish=false" >> "$GITHUB_OUTPUT" ;;
            *)   echo "::error::registry returned $code"; exit 1 ;;
          esac

  deploy:
    needs: check
    if: needs.check.outputs.publish == 'true'
    runs-on: ubuntu-latest
    # Through the environment, never inlined into a script body: a template
    # expression is substituted before the shell sees it, so a crafted value
    # would run as code.
    env:
      PACKAGE: ${{ needs.check.outputs.package }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-unknown-unknown }
      - uses: ./.github/actions/setup-cargo-mero

      - name: Write signing key
        env:
          MERO_SIGN_KEY: ${{ secrets.MERO_SIGN_KEY }}
        run: |
          umask 077
          printf '%s' "$MERO_SIGN_KEY" > "$RUNNER_TEMP/key.json"

      - name: Verify the signer still matches the published package
        run: |
          signer=$(cargo mero key derive-signer-id --key "$RUNNER_TEMP/key.json")
          published=$(curl -fsS "https://apps.calimero.network/api/v2/bundles?package=$PACKAGE" \
            | jq -er '.[0].signerId // ""')
          if [ -n "$published" ] && [ "$signer" != "$published" ]; then
            echo "::error::key does not match the published signer; this would"
            echo "::error::land as a NEW application id instead of an upgrade"
            exit 1
          fi

      - name: Build & sign
        id: build
        working-directory: logic
        # --print-output-path rather than rebuilding dist/<package>-<version>.mpk
        # here, so the filename has one author and cannot drift out of step.
        run: |
          mpk=$(cargo mero bundle --key "$RUNNER_TEMP/key.json" --print-output-path | tail -1)
          echo "mpk=$mpk" >> "$GITHUB_OUTPUT"

      - name: Remove signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/key.json"

      - run: cargo mero publish "${{ steps.build.outputs.mpk }}"
        working-directory: logic
        env:
          CALIMERO_API_KEY: ${{ secrets.CALIMERO_REGISTRY_API_KEY }}
```

### Why the registry decides, not git

Asking the registry whether a version exists holds up under re-runs, reverts, and squashed merges.
Diffing `Cargo.toml` against the previous commit does not: a re-run of the same job sees no diff and skips a release that never happened, and a squashed merge can show a version change that was already published.

Handle the third case explicitly.
A registry that is unreachable, or that answers something other than 200 or 404, must fail the job rather than read as "not published" and republish blind.

### Handling the secrets

Write the key to `$RUNNER_TEMP` under `umask 077`, never into the workspace, and delete it in an `if: always()` step so a failed build does not leave it on the runner.
Pass every secret and every template expression through the environment rather than inlining it into a script body: a template expression is substituted before the shell sees it, so a crafted input would run as code.

### Pinning the toolchain

Install a released `cargo-mero` binary at a fixed version with a per-asset checksum.
The tool writes what goes inside the bundle, so letting it float means a release can change shape without anything in the repository changing.

```bash
RELEASE=0.11.0-rc.20

# Per-asset SHA-256, so a re-uploaded asset under the same tag cannot swap
# the binary silently. Refresh these together with RELEASE.
CHECKSUM_x86_64_unknown_linux_gnu=86e32bd1a7fd976dafaa8269dfdfe4e8d89b35f0a62f3a6f6d3c4a6387ec9331
```

Put the install in a script and wrap it in a composite action, so CI and a developer's machine run the same one command.

---

## What the registry checks

`cargo mero publish` sends the manifest to `POST /api/v2/bundles/push` with `Authorization: Bearer $CALIMERO_API_KEY`.
The whole `.mpk` rides along under a `_binary` field; `_`-prefixed keys are stripped before signature verification, so attaching it does not disturb what was signed.

| Check                                                         | Failure                 |
| ------------------------------------------------------------- | ----------------------- |
| Manifest carries a valid Ed25519 signature                    | `400 invalid_signature` |
| Signature block is present at all                             | `400 missing_signature` |
| Signing key matches the package's signer, or is in `owners[]` | `403 not_owner`         |
| `package` and `appVersion` are present                        | `400 invalid_manifest`  |

`metadata.author` is set server-side from the publishing account and carried forward from the package's oldest version, so a manifest cannot set or change it.

The browser upload endpoint, `POST /api/v2/bundles/push-file`, authorizes differently: it accepts **org membership** in place of a key match, and it rejects a version that is not greater than the latest published one.
`push` leaves version ordering to the caller, which is what `--bump` is for.

---

## Editing published metadata

`name`, `description`, and `links` stay editable after publishing.
The edit is still a signed manifest, so it is a three-step flow:

```bash
# 1. fetch the current manifest with your changes applied
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --name "New Name" --description "Updated description" -o manifest.json

# 2. sign it
cargo mero sign manifest.json --key my-key.json

# 3. PATCH it back
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --manifest manifest.json
```

The same flow is available from the app page in the web UI, which hands you the unsigned manifest to sign.

---

## Troubleshooting

**`403 not_owner`**
The signing key is not the one that published the package.
Compare `cargo mero key derive-signer-id -k your-key.json` against the package's `signerId` from `GET /api/v2/bundles?package=<package>`.
There is no way to transfer a package to a new key: a different key is a different application.

**The registry refused a dev-signed bundle**
`--dev` uses a key everyone has. Sign with `--key`.

**`bundle` refuses to pack**
Every bundle entry names an `abi.json`. An app built against an SDK that predates `__calimero_abi` emits no ABI, and `build` warns about it. Update the SDK, or pass `--no-abi` to publish a bundle that cannot be migrated.

**Published, but the desktop shows a new app rather than an upgrade**
The package was previously published under a different signer, most often the dev key. That lineage cannot be continued; the new key mints a new `ApplicationId`.

---

## Reference

- [`cargo mero` README](https://github.com/calimero-network/core/tree/master/tools/cargo-mero) - full command and metadata reference
- [`cargo mero` SIGNING.md](https://github.com/calimero-network/core/blob/master/tools/cargo-mero/SIGNING.md) - key handling and identity derivation
- [Registry README](README.md) - ownership rules and organizations
- [API format standard](API_FORMAT_STANDARD.md) - response shapes
