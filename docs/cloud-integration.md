# Calimero Cloud integration

app-registry is the single package registry for Calimero Cloud. Cloud orgs
publish **private** packages into it; Cloud clusters install them; everyone
else keeps using it exactly as before. This document is the contract between
app-registry and the Cloud manager (**mdma**, `manager/app/v2/app_registry.py`,
`registry_jwt.py`, `V2.md` "Registry"). Both sides implement what is written
here; change it here first.

## Parties

| Party                 | Talks to app-registry with                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Developer console     | mdma, which calls app-registry with a Cloud JWT                                                               |
| CI / `cargo mero`     | a Cloud JWT minted by mdma from an org API key (`POST {MDMA}/api/v2/registry/token`)                          |
| Calimero node (merod) | one `GET /artifacts/...`, basic auth from the userinfo of `--registry-url`, no redirects                      |
| app-registry          | mdma's `/internal/registry/authorize` (per private download) and `/internal/registry/published` (per publish) |

Registry accounts (Google session, `Authorization: Bearer <API token>`) keep
working unchanged.

## 1. Cloud JWTs (mdma -> app-registry)

`Authorization: Bearer <jwt>`.

- Header: `{"alg": "EdDSA" | "RS256", "kid": "..."}`. No other algorithm is
  accepted.
- Keys: `GET {MDMA}/.well-known/jwks.json`, configured as `CLOUD_JWKS_URL`.
  Fetched lazily and cached 10 minutes per function instance; an unknown `kid`
  triggers a refetch (at most every 30 s), so key rotation needs no registry
  deploy. Publish the new key in the JWKS before signing with it.
- Claims:

  | Claim           | Required | Meaning                                                                                                         |
  | --------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
  | `iss`           | yes      | must equal `CLOUD_ISSUER` (mdma default `cloud.calimero.network`)                                               |
  | `aud`           | yes      | must contain `CLOUD_AUDIENCE` (default `registry`)                                                              |
  | `sub`           | yes      | developer id                                                                                                    |
  | `email`         | no       | developer email; the identity recorded as owner/actor. Without it, `sub` if it contains `@`, else `cloud:<sub>` |
  | `org`           | yes      | Cloud org id (string)                                                                                           |
  | `org_slug`      | no       | display only; used to name the registry org on first use                                                        |
  | `role`          | no       | `owner` \| `admin` \| `developer` (anything else = plain member)                                                |
  | `scope`         | yes      | `publish` or `read` (space-separated list or array accepted). `publish` implies `read`.                         |
  | `iat`, `exp`    | yes      | `exp - iat` must be <= `CLOUD_JWT_MAX_TTL_SECONDS` (default 3600; mdma uses 600)                                |
  | `nbf`           | no       | honoured; 30 s clock tolerance on all time claims                                                               |
  | `jti`           | no       | not tracked (tokens are short-lived)                                                                            |
  | `via`, `key_id` | no       | `via: "api_key"` marks a token minted from an org API key; recorded in the audit log and the publish webhook    |

- A Cloud JWT is **not** a registry account. It is accepted only on the
  endpoints below; every other endpoint treats the request as unauthenticated
  (it cannot mint API tokens, set a username, manage registry org membership,
  or act as a site admin, whatever its email).
- A Cloud token is never "staff": `com.calimero.*` / `network.calimero.*`
  (and look-alikes) stay reserved to registry accounts.

### Where a Cloud JWT is accepted

| Endpoint                                                                               | Scope   | Role         |
| -------------------------------------------------------------------------------------- | ------- | ------------ |
| `POST /api/v2/bundles/push` (JSON, `_binary` or `_upload`)                             | publish | any          |
| `POST /api/v2/bundles/push-file` (multipart field `bundle`)                            | publish | any          |
| `POST /api/v2/bundles/upload-url` (staged upload, 50 MiB)                              | publish | any          |
| `GET/PUT /api/v2/packages/:pkg/visibility`                                             | publish | owner, admin |
| `POST /api/v2/bundles/:pkg/:ver/yank`                                                  | publish | owner, admin |
| `DELETE /api/v2/bundles/:pkg`, `DELETE /api/v2/bundles/:pkg/:ver`                      | publish | owner, admin |
| `GET /api/v2/bundles` (listing, `?fresh=1` / `?include_private=1`), `?package&version` | read    | any          |
| `GET /api/v2/bundles/:pkg/:ver`, `GET /api/v2/packages/:pkg`, assets                   | read    | any          |
| `GET /artifacts/:pkg/:ver/:file`                                                       | read    | any          |
| `GET /api/v2/orgs/:id/audit`                                                           | any     | owner, admin |

"Org" always means: the Cloud org in the token is the one linked to the
package's registry org.

## 2. Data model (Redis)

| Key                        | Value                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pkg:<name>`               | `{name, org_id, visibility: "public"\|"private", signer_id, owner_email, created_at, updated_at, visibility_request?, visibility_decision?}` |
| `org:<id>`                 | org document; gains `cloud_org_id` and optional `quotas`                                                                                     |
| `org:by_cloud:<cloud_org>` | registry org id                                                                                                                              |
| `ns:<namespace>`           | registry org id owning the namespace                                                                                                         |
| `visibility-requests`      | set of packages waiting on private -> public review                                                                                          |
| `org-audit:<org_id>`       | append-only list of JSON audit events                                                                                                        |

- A package with **no** `pkg:` record is public (every pre-existing package
  until `scripts/migrate-package-records.js` runs, and it then writes
  `public`). Only an explicit `private` hides anything.
- The first Cloud token of a Cloud org creates its registry org:
  id `cloud-<cloud_org_id>`, slug from `org_slug` if that slug is free and not
  reserved (else `<slug>-cloud`, …). A Cloud org is **never** attached to an
  existing registry org by slug; that is an explicit admin step
  (`migrate-package-records.js --link-cloud-org <orgId>=<cloudOrgId>`).
- Membership of a Cloud-linked org lives in Cloud; the registry trusts the
  token's `role`.

## 3. Publishing

Both publish routes run the same gate (`api/lib/package-records.js`
`publishGate`) after the signature check:

1. **Scope**: a Cloud token needs `publish`.
2. **Namespace** (new packages only). `namespaceOf(pkg)`:
   `com.acme.app -> com.acme`, `acme.app -> acme`,
   `io.github.alice.app -> io.github.alice`
   (`shared/package-namespace.js`). A Cloud publish claims an unclaimed
   namespace for its org (atomic `SETNX`), unless the namespace already holds
   packages owned by anyone else (`409 namespace_conflict`); a namespace
   owned by another org is `403 namespace_owned`. Registry accounts never
   claim, and may create a package in a claimed namespace only as a member of
   the owning org (the package is then linked to it). Reserved prefixes are
   refused (`403 reserved_prefix`) and never claimed.
3. **Existing packages** (Cloud): must belong to the caller's org
   (`403 not_owner`) and be signed by a pinned key — the latest version's
   signer or a key in its `owners[]` (`403 signer_mismatch`). The registry's
   "org admin publishes with their own key" path does not apply to Cloud
   tokens.
4. **Quotas** (Cloud org publishes only), `413 quota_exceeded` with `limit`:
   `max_bundle_bytes` (default 100 MiB), `max_versions_per_package` (200),
   `max_total_bytes` (5 GiB, summed over all versions of the org's packages).
   Env `CLOUD_QUOTA_MAX_BUNDLE_BYTES`, `CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE`,
   `CLOUD_QUOTA_MAX_TOTAL_BYTES`; per org `org.quotas.{same keys}`.
5. **Visibility** for a new package: `_visibility` in the JSON body (outside
   the signature, like every `_` key) or header `X-Registry-Visibility`;
   default `private` for a Cloud publish, `public` for a registry account. A
   later version never changes it (a differing request returns a warning).

Response `201` gains `visibility`.

### Size limits on the way in

Vercel caps a function's **request** body at 4.5 MB, so `push` with
`_binary` (hex) carries at most ~2.2 MB and `push-file` at most ~4.5 MB.
Anything larger must use `POST /api/v2/bundles/upload-url` (signed PUT
straight to GCS, up to 50 MiB) and then `push` with
`_upload: {object}`. Cloud publish tokens may use `upload-url`.
**mdma's console upload (`push-file`) therefore fails with 413 above 4.5 MB
on Vercel; it should switch to `upload-url` + `push` for large bundles.**

## 4. Visibility changes

`PUT /api/v2/packages/:pkg/visibility {"visibility": "public"|"private"}`
(`GET` returns the current state):

- public -> private: immediate, `200`.
- private -> public: a request, `202 {visibility: "private", pending_visibility: "public"}`.
  It appears in the admin review queue (`GET /api/admin/review-queue`,
  entry `visibilityRequest`), and `PATCH /api/admin/packages/:pkg
{"action": "approve"|"decline"}` settles it. A site admin's own request is
  immediate.
- private while a public request is pending: cancels it.

A caller who may not manage a private package gets `404`, never `403`.

## 5. Reads

Private packages are absent — the same `404` / missing entry as a name never
published — for everyone except: a Cloud token with `read` of the owning
org, a registry member of the owning org, the account that first published
it, and site admins. This applies to the listing, `?package&version`,
`/api/v2/bundles/:pkg/:ver`, `/api/v2/packages/:pkg`, assets, the sitemap,
`/api/stats`, download counting and the artifact URL.

Caching: public responses are unchanged (`s-maxage=30`). Any response that
contains a private package is `Cache-Control: private, no-store`. The edge
cache keys on the URL only, so an authenticated caller must use a URL no
anonymous visitor uses: `?fresh=1` (what mdma's listing sends) or
`?include_private=1`; both are answered `no-store`. Listing entries of
private packages carry `"visibility": "private"`.

## 6. Downloads and `POST /internal/registry/authorize` (app-registry -> mdma)

`GET /artifacts/{pkg}/{ver}/{pkg}-{ver}.mpk` (also `/api/artifacts/...`):

- Public package: open, as before.
- Private package, one of:
  - `Authorization: Basic base64(cluster_user:token)` (from the userinfo of
    the cluster's `--registry-url`). app-registry asks mdma:

    ```
    POST {CLOUD_AUTHORIZE_URL}            # {MDMA}/internal/registry/authorize
    Content-Type: application/json
    X-Registry-Timestamp: <unix seconds>
    X-Registry-Signature: sha256=<hex HMAC-SHA256(CLOUD_AUTHORIZE_HMAC_SECRET, "<ts>.<raw body>")>

    {"cluster_user": "...", "token": "...", "package": "...", "version": "...", "org": "<owning Cloud org id>"}
    ```

    mdma answers `200 {"allowed": bool, "org_id": string|null}` and rejects a
    bad/missing signature or a timestamp more than 5 minutes off with 401.
    The download is served iff `allowed === true` **and** `org_id` equals
    the package's owning Cloud org (the registry checks this itself; mdma
    also checks `org` agrees).

  - `Authorization: Bearer <Cloud JWT>` with `read` for the owning org
    (console / CLI downloads), or a registry session/API token of someone
    who may read it.
- Not allowed: `404 {"error":"artifact_not_found"}`, byte-identical to a
  package that does not exist (core reads 404 as "not published").
- mdma unreachable, timeout (`CLOUD_AUTHORIZE_TIMEOUT_MS`, default 3000),
  non-200 or malformed answer: `503 authorize_unavailable` with
  `Retry-After: 5` — fail closed, never cached.
- Answers are cached per function instance, keyed by a hash of
  (cluster_user, token, package, version, org): allowed 60 s, denied 10 s.
  Revoking a cluster credential therefore takes up to 60 s to bite.
- Private downloads are `Cache-Control: private, no-store`, `Vary: Authorization`.
- Single GET, no redirect: the registry never redirects (core refuses
  redirects), it streams the bytes itself (section 9).

## 7. `POST /internal/registry/published` (app-registry -> mdma)

After every successful publish of a package whose org is Cloud-linked —
whether through mdma or straight from CI with an API-key JWT — app-registry
notifies mdma so it can record versions it did not upload itself:

```
POST {CLOUD_PUBLISHED_URL}   # default: CLOUD_AUTHORIZE_URL with /authorize -> /published
X-Registry-Timestamp / X-Registry-Signature   # same scheme and secret as authorize

{
  "package": "com.acme.app",
  "version": "1.2.0",
  "org": "<Cloud org id>",
  "visibility": "private",
  "manifest_digest": "sha256:<hex>",   // SHA-256(domain tag "calimero.bundle.manifest.v1\0" || JCS(manifest without signature and _keys)) — exactly the signed payload
  "bundle_digest": "sha256:<hex>",     // SHA-256 of the .mpk bytes
  "signer": "<base64url Ed25519 public key>",
  "published_at": "2026-10-28T12:00:00.000Z",
  "via": "cloud" | "api_key" | "registry",
  "key_id": "<org API key id>"         // only when via = api_key
}
```

mdma answers 2xx. Delivery is best effort: awaited with a 2 s timeout, never
fails the publish, not retried. mdma must treat it as idempotent and, to
recover a missed notification, can always reconcile from
`GET /api/v2/bundles?fresh=1` and the org audit log.

## 8. Audit log

`GET /api/v2/orgs/:id/audit?limit=50&offset=0` — `:id` is the registry org id
or the Cloud org id. Owner/admin Cloud tokens of that org, registry org
admins/owners, site admins. Newest first:

```json
{
  "org_id": "cloud-org_acme",
  "cloud_org_id": "org_acme",
  "total": 4,
  "events": [
    {
      "id": "...",
      "at": "...",
      "type": "publish",
      "org_id": "...",
      "package": "com.acme.app",
      "version": "1.0.0",
      "actor": {
        "id": "dev@acme.io",
        "via": "cloud",
        "cloud_org_id": "org_acme",
        "role": "admin"
      },
      "details": {
        "visibility": "private",
        "install_size": 12345,
        "signer": "...",
        "manifest_digest": "sha256:..."
      }
    }
  ]
}
```

Types: `publish`, `visibility_change`, `visibility_request`,
`visibility_decision`, `yank`, `unyank`, `delete_version`, `delete_package`.
The list is never trimmed or rewritten; appends are best effort (a failed
append is logged, the action stands).

## 9. Large files (finding)

- Before this change `/artifacts` downloaded the whole object from GCS,
  hex-encoded it, decoded it again (three copies in memory) and returned it
  as one response body. A non-streamed Vercel Function response is capped at
  **4.5 MB**, so any `.mpk` above that failed in production regardless of the
  1024 MB memory setting; core's own cap is 512 MiB.
- Now the handler pipes the GCS object (generation-pinned, `Content-Length`
  from its metadata) straight to the response. Node.js Vercel Functions
  stream such responses, and streamed responses are not subject to the
  4.5 MB body cap; the remaining bound is `maxDuration` (60 s in
  `vercel.json`): 512 MiB in 60 s needs ~9 MB/s end to end.
- **To verify before relying on it** (vercel.com could not be reached from
  the environment this was written in): on a preview deployment,
  `curl -o /dev/null -w '%{size_download} %{time_total}\n'` a 100 MB and a
  500 MB bundle. If it fails or is too slow, either raise `maxDuration` for
  `api/artifacts/**` (Pro/Fluid allow more), or serve `/artifacts/*` from a
  small Cloud Run service running this same handler
  (`api/artifacts/[package]/[version]/[filename].js` with the same Redis/GCS
  env), pointed to by clusters' `--registry-url` (core only uses that base for
  `/artifacts/...`) — not built here.

## 10. Environment

| Variable                                                                                              | Purpose                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CLOUD_JWKS_URL`                                                                                      | `{MDMA}/.well-known/jwks.json`. With `CLOUD_ISSUER` unset or this unset, Cloud JWTs are not accepted at all |
| `CLOUD_ISSUER`                                                                                        | expected `iss` (mdma default `cloud.calimero.network`)                                                      |
| `CLOUD_AUDIENCE`                                                                                      | expected `aud` (default `registry`)                                                                         |
| `CLOUD_JWT_MAX_TTL_SECONDS`                                                                           | max `exp - iat` (default 3600)                                                                              |
| `CLOUD_AUTHORIZE_URL`                                                                                 | `{MDMA}/internal/registry/authorize`                                                                        |
| `CLOUD_AUTHORIZE_HMAC_SECRET`                                                                         | shared secret for authorize and published (= mdma's `MDMA_REGISTRY_AUTHORIZE_HMAC_SECRET`)                  |
| `CLOUD_AUTHORIZE_TIMEOUT_MS`                                                                          | authorize timeout (default 3000)                                                                            |
| `CLOUD_PUBLISHED_URL`                                                                                 | override for the publish webhook URL                                                                        |
| `CLOUD_QUOTA_MAX_BUNDLE_BYTES`, `CLOUD_QUOTA_MAX_VERSIONS_PER_PACKAGE`, `CLOUD_QUOTA_MAX_TOTAL_BYTES` | quota defaults                                                                                              |

Like the storage variables, non-production deployments read the `PREVIEW_`
form (`PREVIEW_CLOUD_JWKS_URL`, …), so a preview can never trust production's
mdma or secret.

## 11. Rollout

1. Deploy with the `CLOUD_*` variables unset: nothing changes (no records =
   public; Cloud JWTs ignored).
2. `node scripts/migrate-package-records.js` (dry run), then `--apply`;
   optionally `--link-cloud-org <orgId>=<cloudOrgId>` for existing registry
   orgs that move to Cloud, and `--claim-namespaces` to reserve namespaces
   that an org already wholly owns.
3. Set the `CLOUD_*` variables.
