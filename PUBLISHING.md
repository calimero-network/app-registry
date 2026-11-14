# Publishing to the Calimero App Registry

How an app gets from a Rust crate to a published bundle, by hand and from CI.

Everything here is done with `meroctl`, core's single command line (core 1.0.0-rc.24 and later): `meroctl app build`, `app pack`, `app sign`, `app inspect` and `app publish` need no node.
It replaces `cargo mero`, the per-app `build.sh` / `build-bundle.sh` scripts, standalone `mero-sign` invocations, and `calimero-registry bundle create` / `bundle push`.
`calimero-registry` ([packages/cli](packages/cli/README.md)) is still the tool for organization administration and metadata edits; it has no role in building bundles.

---

## Prerequisites

```bash
curl -fsSL https://raw.githubusercontent.com/calimero-network/core/master/scripts/install.sh | sh -s -- meroctl
rustup target add wasm32-wasip2
```

The installer downloads a prebuilt `meroctl` from the newest [core release](https://github.com/calimero-network/core/releases) (`--version <tag>` picks one) and checks it against that release's `SHA256SUMS` before putting it in `~/.local/bin`.
Apps are `calimero:app` WASM components: `meroctl app build` and `app pack` run `cargo build --release --target wasm32-wasip2`, so the target must be installed.
CI should install a pinned release with a checksum kept in the repository (see [Pinning the toolchain](#pinning-the-toolchain)).

Every command and flag: the [meroctl reference](https://calimero-network.github.io/core/operate/meroctl/).

---

## Describing the app

Bundle metadata comes from a `[package.metadata.calimero]` table in the app crate's `Cargo.toml`.
There is no `manifest.json` to write or keep in sync: `meroctl app pack` generates and signs it.

```toml
[package]
name = "my-app"
version = "1.2.4"                       # the bundle's appVersion

[package.metadata.calimero]
package = "com.example.my-app"          # required, the app id, immutable once published
min-runtime-version = "1.0.0"           # the oldest node release that runs it (default 0.1.0)
frontend-dir = "../app/dist"            # a static web build, packed as frontend/ (relative to the crate)
name = "My App"
description = "A collaborative example app"
icon = "assets/icon.png"                # a PNG, read and embedded as a data: URI at pack time
category = "productivity"
license = "MIT"
tags = ["social", "chat"]
frontend = "https://my-app.example.com"
github = "https://github.com/example/my-app"
```

`pack` also reads `author`, `guide` (a file, embedded as text), `slug`, `docs`, `frontend-aliases`, `outbound` (the `https://` prefixes the app's runs may call) and `upgrades` (`owner` or `publisher`). A flag on the command line wins over the table.

`frontend` is where clients open your app, and a node's sign-in page hands login tokens only to its origin. When the app moves domain, list the old address in `frontend-aliases = ["https://old.example.com"]`: clients still open only `frontend`, but a login from the old origin keeps working while nodes and launchers still open it. Drop the alias in a later version once nothing does. Each entry must be an http(s) URL; the registry refuses anything else.

The registry refuses a **new** package (`400 metadata_incomplete`) without `name` (at most 64 characters), `description` (20 to 4000), `icon` (a square PNG, at least 512x512, at most 512 KiB) and a `category` from its list (`games`, `productivity`, `communication`, `social`, `art-design`, `media`, `planning`, `security`, `utilities`, `developer-tools`). For a package that already exists these are warnings.

The app version is not a metadata key.
It is the crate's `[package] version`, or `--app-version`. A version inherited from a workspace (`version.workspace = true`) is not read: pass `--app-version`.

`pack` builds one crate: the app component, plus the compute component when the app has compute methods. There is no multi-service (`[workspace.metadata.calimero] services`) bundle.

---

## Signing keys

Every bundle carries an Ed25519 signature over its manifest.
There are two kinds of key and the choice decides whether the bundle can leave your machine.

| Signing method                   | What it means                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no `--key` (`app sign`: `--dev`) | A single well-known development key baked into the tool, so every such bundle everywhere shares one signer. Fine for local installs; proves nothing about provenance. **The registry refuses it.** |
| `--key <file>`                   | A private key only you hold. Required for anything published.                                                                                                                                      |

```bash
meroctl app signer new my-key.json
# Generated new keypair: my-key.json
#   signerId: did:key:z6MkrV2imerTHzYtPyb2groFVNJSokGX7rpxnuJj8DSEQDnH

meroctl app signer id my-key.json   # prints the did:key signer id
```

The key file is written owner-only. `signer new` refuses to overwrite an existing file unless given `--force`, which makes the old key unrecoverable.
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
# 1. build, sign and pack; --previous compares against the last release
meroctl app pack . --key my-key.json --previous last.mpk
# → ./dist/com.example.my-app-1.2.4.mpk

# 2. check what was signed (signature, every hash, the manifest and signer)
meroctl app inspect dist/com.example.my-app-1.2.4.mpk

# 3. publish
export CALIMERO_REGISTRY_API_KEY=<token>
meroctl app publish dist/com.example.my-app-1.2.4.mpk
```

`pack` prints `{"wrote": <path>, "package", "appVersion"}` as JSON.

Useful `pack` flags:

| Flag                                                                                    | Effect                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--key <file>`                                                                          | Sign with this key. Without it, the development key, which the registry refuses.                                                           |
| `--previous <last.mpk>`                                                                 | The last release (`.mpk`, `.wasm` or ABI JSON): report ABI changes that break callers, refuse a state change without a state version bump. |
| `--out <file>`                                                                          | Override `<DIR>/dist/<package>-<version>.mpk`.                                                                                             |
| `--app-version <v>`                                                                     | Set the version instead of the crate's.                                                                                                    |
| `--wasm <file>`, `--compute <file>`                                                     | Pack already-built components instead of building DIR (`meroctl app build` writes them).                                                   |
| `--frontend <dir>`, `--no-frontend`                                                     | Pack this static build as `frontend/` (entry `--frontend-entry`, default `index.html`), or leave out `frontend-dir`.                       |
| `--pipeline <file>`                                                                     | Ship a pipeline YAML (repeatable).                                                                                                         |
| `--outbound <https://prefix>`                                                           | Add a prefix the app's runs may send requests under (repeatable).                                                                          |
| `--upgrades owner\|publisher`                                                           | Who upgrades the package's instances (default: the owner).                                                                                 |
| `--package`, `--name`, `--description`, `--icon`, `--category`, `--min-runtime-version` | Override the metadata table.                                                                                                               |

`publish` flags:

| Flag               | Environment                 | Effect                                                                                                            |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--registry <url>` | `CALIMERO_REGISTRY_URL`     | The registry (default `https://apps.calimero.network`). Must be `https://` unless it is a loopback address.       |
| `--api-key <key>`  | `CALIMERO_REGISTRY_API_KEY` | The registry token (Organizations page, **CLI Access**), or with `--org` the Cloud organization's `ck_live_` key. |
| `--org <org>`      |                             | Publish as a Calimero Cloud organization (see below).                                                             |
| `--cloud <url>`    | `CALIMERO_CLOUD_URL`        | The Cloud, for `--org` (default `https://cloud.calimero.network`).                                                |
| `--public`         |                             | List a new package publicly (sends `_visibility: "public"`).                                                      |

Note the variable: `meroctl` reads `CALIMERO_REGISTRY_API_KEY`, while `calimero-registry` reads `CALIMERO_API_KEY`.

There is no `--bump`: the version is the crate's (or `--app-version`), and the registry refuses one that is not greater than the latest published (`400 version_not_allowed`). To let the registry choose the next version instead, read the latest from `GET /api/v2/bundles?package=<package>` and pass `--app-version`; the apps repository's [`scripts/registry-release.sh`](https://github.com/calimero-network/apps/blob/main/scripts/registry-release.sh) `next-version` does this.

### Large bundles

`meroctl app publish` sends the whole `.mpk` hex-encoded in `_binary`, and Vercel caps a request body at 4.5 MB, so a bundle over about 2.2 MB (a frontend usually takes it there) cannot be published that way.
Upload it to storage first and push the manifest with a reference to it:

1. `POST /api/v2/bundles/upload-url` with the same `Authorization: Bearer` token returns `{ object, url, method, headers, expiresAt }`.
2. `PUT` the raw `.mpk` to `url` with `headers` replayed verbatim, before `expiresAt`.
3. `POST /api/v2/bundles/push` with the signed `manifest.json` from the `.mpk` plus `_upload: { "object": <object> }` in place of `_binary`.

The apps repository's [`scripts/publish-bundle.sh`](https://github.com/calimero-network/apps/blob/main/scripts/publish-bundle.sh) does exactly this (`CALIMERO_API_KEY` and `CALIMERO_REGISTRY_URL`).
Limits are under [What the registry checks](#what-the-registry-checks).

---

## Publishing to a Calimero Cloud org

```bash
export CALIMERO_REGISTRY_API_KEY=ck_live_...   # the Cloud org's API key, scope registry:publish
meroctl app publish dist/com.acme.app-1.0.0.mpk --org acme
```

With `--org`, `meroctl` first trades the org key for a short-lived Cloud JWT at the Cloud (`POST {cloud}/api/v2/registry/token {"org", "scope": "publish"}`), then pushes with it. The token lives 10 minutes, so it is minted per publish.

- New Cloud packages are **private** unless you ask otherwise: `--public` (`_visibility: "public"` in the body, or the `X-Registry-Visibility: public` header). A private package is invisible to everyone outside the org and installable only by the org's clusters. A publish never changes an existing package's visibility.
- Your org's first package claims its namespace (`com.acme.app` claims `com.acme`; `acme.app` claims `acme`). Nobody else can publish under it.
- Every later version must be signed with the package's pinned key (its first signer, or a key in `owners[]`).
- Per-org quotas apply (bundle size, versions per package, total bytes); a refusal is `413 quota_exceeded` with the limit.
- To go public later: `PUT /api/v2/packages/<pkg>/visibility {"visibility": "public"}` as an org owner or admin. A registry admin reviews it first.
- A Cloud token with the `publish` scope may also use [`upload-url`](#large-bundles) for a large bundle.

See [docs/cloud-integration.md](docs/cloud-integration.md) for the details.

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
      ▼  read the crate's version + [package.metadata.calimero] package
      │
      ▼  GET /api/v2/bundles/<package>/<version>
      │     404 → publish        200 → already released, stop
      │     anything else → fail (never republish on a blind guess)
      │
      ▼  install pinned meroctl, write the key from the secret
      │
      ▼  meroctl app signer id  ==  the package's published signerId?
      │     no → fail before signing anything
      │
      ▼  meroctl app pack --key ...   →   meroctl app publish
```

### The workflow

```yaml
name: Deploy Bundle

on:
  push:
    branches: [master]
    paths: ['logic/Cargo.toml'] # the version lives here and nowhere else
  workflow_dispatch:

# One registry for every step, and the variable meroctl reads, so a staging
# run cannot check one registry and publish to another.
env:
  CALIMERO_REGISTRY_URL: https://apps.calimero.network

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
        run: |
          read -r package version < <(python3 -c '
          import tomllib
          with open("logic/Cargo.toml", "rb") as f:
              p = tomllib.load(f)["package"]
          print(p["metadata"]["calimero"]["package"], p["version"])
          ')

          # Validate before either value reaches a URL. An empty package makes
          # the check below query .../bundles//, and a 404 on a malformed path
          # reads as "not published" - the blind republish this job prevents.
          case "$package" in
            '' | *[!a-z0-9.-]*) echo "::error::bad package id '$package'"; exit 1 ;;
          esac
          # Full semver, so a pre-release such as 1.0.0-rc.1 is accepted.
          # Anchored, so a trailing newline cannot forge a second output.
          [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] || {
            echo "::error::version must be semver (got '$version')"; exit 1; }

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
            "$CALIMERO_REGISTRY_URL/api/v2/bundles/$PACKAGE/$VERSION" || echo "000")
          case "$code" in
            200) echo "publish=false" >> "$GITHUB_OUTPUT" ;;
            404) echo "publish=true" >> "$GITHUB_OUTPUT" ;;
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
      VERSION: ${{ needs.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-wasip2 }
      - run: scripts/install-meroctl.sh # see "Pinning the toolchain"

      - name: Write signing key
        env:
          MERO_SIGN_KEY: ${{ secrets.MERO_SIGN_KEY }}
        run: |
          umask 077
          printf '%s' "$MERO_SIGN_KEY" > "$RUNNER_TEMP/key.json"

      - name: Verify the signer still matches the published package
        run: |
          signer=$(meroctl app signer id "$RUNNER_TEMP/key.json")

          # Separate "could not ask" from "nothing published". Reading the
          # failure as an empty listing skips the one check this step exists
          # for, which is the same trap as the version probe above.
          if ! listing=$(curl -fsS --retry 3 --retry-delay 2 --max-time 30 \
              "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE&fresh=1"); then
            echo "::error::could not reach the registry to verify the signer"
            exit 1
          fi

          # The registry pins one signer per package, so the latest entry
          # answers this. An empty list is a first publish, with nothing to
          # compare against.
          published=$(jq -er '.[0].signerId // ""' <<<"$listing")
          if [ -n "$published" ] && [ "$signer" != "$published" ]; then
            echo "::error::key does not match the published signer; this would"
            echo "::error::land as a NEW application id instead of an upgrade"
            exit 1
          fi

      - name: Build & sign
        id: build
        # pack's JSON answer names the file, so the filename has one author
        # and cannot drift out of step.
        run: |
          mpk=$(meroctl app pack logic --key "$RUNNER_TEMP/key.json" | jq -er .wrote)
          echo "mpk=$mpk" >> "$GITHUB_OUTPUT"

      - name: Remove signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/key.json"

      - name: Publish
        env:
          CALIMERO_REGISTRY_API_KEY: ${{ secrets.CALIMERO_REGISTRY_API_KEY }}
          MPK: ${{ steps.build.outputs.mpk }}
        run: meroctl app publish "$MPK"
```

A pre-release version publishes like any other: bumping to `1.0.0-rc.1` on the default branch releases it, and the registry orders it below `1.0.0` rather than treating it as latest.
If you would rather keep pre-releases out of the registry entirely, narrow the version check to `^[0-9]+\.[0-9]+\.[0-9]+$` and they will fail the gate instead.

A bundle over the `_binary` limit replaces the last step with the [upload-url flow](#large-bundles).
The apps repository's [`publish-component.yml`](https://github.com/calimero-network/apps/blob/main/.github/workflows/publish-component.yml) is a full production example of the other choice, where the registry owns the version: it asks `scripts/registry-release.sh next-version` for it, packs with `--app-version`, checks the signer of the built bundle with `check-signer`, and publishes through `upload-url`.

### The gate answers one question

`GET /api/v2/bundles/<package>/<version>` asks whether **this exact version** exists, which is what makes the job idempotent across re-runs.
It does not ask whether the version is newer than what is already out; both push endpoints do, and refuse a version that is not greater than the latest published (`400 version_not_allowed`, by semver precedence), so a reverted or badly merged `Cargo.toml` fails the publish instead of slotting below the latest.

### Why the registry decides, not git

Asking the registry whether a version exists holds up under re-runs, reverts, and squashed merges.
Diffing `Cargo.toml` against the previous commit does not: a re-run of the same job sees no diff and skips a release that never happened, and a squashed merge can show a version change that was already published.

Handle the third case explicitly.
A registry that is unreachable, or that answers something other than 200 or 404, must fail the job rather than read as "not published" and republish blind.

### Handling the secrets

Write the key to `$RUNNER_TEMP` under `umask 077`, never into the workspace, and delete it in an `if: always()` step.
That condition is what makes the cleanup reachable: a step with no `if` is skipped once the job is failing, so an earlier failure - the signer check refusing, the build breaking - would otherwise leave the key on disk. It matters most on a self-hosted runner, where the next job inherits the filesystem.
Pass every secret and every template expression through the environment rather than inlining it into a script body: a template expression is substituted before the shell sees it, so a crafted input would run as code.

### Pinning the toolchain

Install a released `meroctl` at a fixed core release with a checksum kept in the repository.
The tool writes what goes inside the bundle, so letting it float means a release can change shape without anything in the repository changing.
Each [core release](https://github.com/calimero-network/core/releases) carries `meroctl_<target>.tar.gz` archives and a `SHA256SUMS` file; copy the sums for the targets you use into the script.

```bash
RELEASE=1.0.0-rc.24

# Per-asset SHA-256, from that release's SHA256SUMS, so a re-uploaded asset
# under the same tag cannot swap the binary silently. Refresh these together
# with RELEASE.
CHECKSUM_x86_64_unknown_linux_gnu=<sha256 of meroctl_x86_64-unknown-linux-gnu.tar.gz>
CHECKSUM_aarch64_apple_darwin=<sha256 of meroctl_aarch64-apple-darwin.tar.gz>

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) TARGET=x86_64-unknown-linux-gnu ;;
  Darwin/arm64) TARGET=aarch64-apple-darwin ;;
  *) echo "no pinned meroctl for $(uname -s)/$(uname -m)" >&2; exit 1 ;;
esac
eval "EXPECTED=\$CHECKSUM_${TARGET//-/_}"

url="https://github.com/calimero-network/core/releases/download/$RELEASE/meroctl_$TARGET.tar.gz"
curl -fsSL "$url" -o meroctl.tar.gz

# Verified before unpacking: a tarball that fails the check should never reach
# PATH, let alone run. Without this the checksum above is decoration.
echo "$EXPECTED  meroctl.tar.gz" | shasum -a 256 -c - \
  || { echo "checksum mismatch for $url" >&2; exit 1; }

mkdir -p "$HOME/.local/bin"
tar -xzf meroctl.tar.gz -C "$HOME/.local/bin" meroctl
```

On a GitHub runner, also `echo "$HOME/.local/bin" >> "$GITHUB_PATH"`.
`install.sh --version <tag>` pins the release too, but it checks against the `SHA256SUMS` of that same release, which catches a corrupt download and not a replaced asset.
Put the script in the repository, so CI and a developer's machine run the same one command; a CI cache key that needs the pinned release can read it from the script.
The app's `calimero-sdk` is pinned separately, by the tag in the crate's `Cargo.toml`.

---

## What the registry checks

`meroctl app publish` sends the signed manifest to `POST /api/v2/bundles/push` with `Authorization: Bearer <token>`.
The whole `.mpk` rides along under a `_binary` field; `_`-prefixed keys are stripped before signature verification, so attaching it does not disturb what was signed.

Vercel rejects request bodies over 4.5 MB, which a hex-encoded `.mpk` of about 2.2 MB or more exceeds.
For those, `POST /api/v2/bundles/upload-url` (any signed-in account: 10 per hour, or 100 for bot, admin and staff accounts and Cloud tokens with the `publish` scope; the object may be up to 50 MiB) returns `{ object, url, method, headers, expiresAt }`.
`PUT` the raw `.mpk` to `url` with `headers` replayed verbatim before `expiresAt` (15 minutes), then push the manifest with `_upload: { object }` in place of `_binary`.
Sending both is `400 invalid_upload`; an object from another account is refused the same way.
The staging object is deleted after the push.

| Check                                                                                                             | Failure                                        |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Manifest carries a valid Ed25519 signature                                                                        | `400 invalid_signature`                        |
| Signature block is present at all                                                                                 | `400 missing_signature`                        |
| Not signed with the well-known development key                                                                    | `400 dev_signing_key`                          |
| Signing key matches the package's signer. A key in `owners[]` is accepted too, but **do not use it**&nbsp;[^1]    | `403 not_owner`                                |
| `package` and `appVersion` are present                                                                            | `400 invalid_manifest`                         |
| `package` is lowercase reverse-DNS; `appVersion` is semver                                                        | `400 invalid_package_name` / `invalid_version` |
| `appVersion` is greater than the latest published                                                                 | `400 version_not_allowed`                      |
| A new package carries the required metadata (see [Describing the app](#describing-the-app))                       | `400 metadata_incomplete`                      |
| A new package does not take a reserved prefix (`com.calimero.*`, `network.calimero.*`) or another org's namespace | `403 reserved_prefix` / `namespace_owned`      |

`metadata.author` is set server-side from the publishing account and carried forward from the package's oldest version, so a manifest cannot set or change it.

[^1]:
    `owners[]` is a registry-level permission that predates the identity model and `meroctl` never writes it; no published manifest carries one.
    A listed key does publish: the endpoint accepts it and stores the version. `ApplicationId` is derived from `package` and `signerId`, so that version belongs to a different application rather than being a new version of the existing one.
    The registry would accept that publish; every node with the app installed would not see it.
    That is why the CI step above compares the signer directly and refuses a mismatch - deliberately stricter than the endpoint, because the endpoint's answer is not the one that matters on the other end.

Both push endpoints also accept a version signed with another key when the publishing account is an **admin or owner** of the org linked to the package; the package's existing key set is kept as it was. The browser upload endpoint, `POST /api/v2/bundles/push-file`, applies the same checks.

---

## Editing published metadata

`name`, `description`, and `links` stay editable after publishing.
The edit is still a signed manifest, so it is a three-step flow:

```bash
# 1. fetch the current manifest with your changes applied
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --name "New Name" --description "Updated description" -o manifest.json

# 2. sign it in place
meroctl app sign manifest.json --key my-key.json

# 3. PATCH it back
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \
  --manifest manifest.json
```

The same flow is available from the app page in the web UI, which hands you the unsigned manifest to sign.

---

## Troubleshooting

**`403 not_owner`**
The signing key is not the one that published the package.
Compare `meroctl app signer id your-key.json` against the package's `signerId` from `GET /api/v2/bundles?package=<package>`.
There is no way to transfer a package to a new key: a different key is a different application.

**`400 dev_signing_key`**
The bundle was packed without `--key` (or signed with `app sign --dev`), so it carries the development key everyone has. Pack again with `--key`.

**`400 version_not_allowed`**
The version is not greater than the latest published. Raise the crate's `version` (or pass `--app-version`) and pack again; the version is inside the signed manifest, so the old `.mpk` cannot be reused.

**`400 metadata_incomplete`**
A new package needs `name`, `description`, `icon` and `category`; the response's `problems` lists what is missing and `categories` the allowed values.

**`413 payload_too_large`, or the request fails at Vercel**
The bundle is over the `_binary` limit. Publish it through [`upload-url`](#large-bundles).

**`pack` refuses to pack**
`pack --previous` refuses a state change without a state version bump; bump the app's state version. A `--wasm` or `--compute` file that is not a WASM component (an SDK 0.12 core module) is refused too: rebuild with `meroctl app build` against the current `calimero-sdk`.

**Published, but the desktop shows a new app rather than an upgrade**
The package was previously published under a different signer, most often the development key. That lineage cannot be continued; the new key mints a new `ApplicationId`.

---

## Reference

- [meroctl reference](https://calimero-network.github.io/core/operate/meroctl/) - every command and flag
- [core README](https://github.com/calimero-network/core#one-command-line) - `meroctl` from an empty directory to production
- [Registry README](README.md) - ownership rules and organizations
- [API format standard](API_FORMAT_STANDARD.md) - response shapes
