/**
 * Bundle Storage Implementation with Vercel KV
 *
 * Persistent storage for V2 bundles using Vercel KV (Redis).
 */

const { kv } = require('./kv-client');
const blob = require('./blob-store');
const semver = require('semver');
const { removeAllAssets } = require('./asset-store');
const { deletePkg2Org } = require('./org-storage');
const {
  reviewKey,
  legacyKey,
  DECIDED_SET,
} = require('@calimero-network/registry-shared/package-review');

// Deleted names and versions are recorded here so a later publish is refused
// rather than silently resurrecting the deleted package under its old trust,
// assets and org link. One flat set, keyed by "<pkg>" for a whole-package
// delete and "<pkg>/<version>" for a single-version delete, and consulted by
// both publish routes before they store anything.
const TOMBSTONE_SET = 'bundle-tombstones';

/**
 * True if a bundle artifact path is NOT a safe, bundle-relative path: it is a
 * non-string, empty, absolute, or contains a `.`/`..`/empty segment. Mirrors
 * the CLI's assertSafeBundlePath (packages/cli/src/lib/services.ts); keep the
 * two in sync.
 */
function isUnsafeBundlePath(p) {
  if (typeof p !== 'string' || p.length === 0) return true;
  const segments = p.split(/[\\/]/);
  return (
    p.startsWith('/') ||
    /^[a-zA-Z]:/.test(p) ||
    segments.includes('..') ||
    segments.includes('.') ||
    segments.includes('')
  );
}

/**
 * True if a service artifact path lives under the `services/` directory (the
 * layout the CLI emits). Combined with isUnsafeBundlePath this stops a service
 * artifact from claiming a top-level name like `app.wasm` and colliding with
 * the main application on unpack.
 */
function underServicesDir(p) {
  return typeof p === 'string' && /^services[\\/]/.test(p);
}

class BundleStorageKV {
  constructor() {
    // No in-memory state needed - all operations use KV
  }

  /**
   * Store a V2 Bundle Manifest
   * @param {Object} manifest The bundle manifest
   * @param {Boolean} overwrite Whether to overwrite existing manifest
   * @throws {Error} If bundle already exists and overwrite is false
   */
  async storeBundleManifest(manifest, overwrite = false) {
    const key = `${manifest.package}/${manifest.appVersion}`;

    // Strip binary from manifest before storing JSON metadata
    const manifestJson = { ...manifest };
    const _binary = manifestJson._binary;
    delete manifestJson._binary;
    delete manifestJson._overwrite;

    // `_adminVerified` is written ONLY by the admin approve route, straight to
    // KV — never through here. Any copy arriving on a publish or a PATCH is a
    // forged "verified" badge riding inside a signed manifest, so it must never
    // be persisted. This is the last line of defence; the push/patch handlers
    // strip all `metadata._*` up front via stripReservedMetadata.
    if (manifestJson.metadata && typeof manifestJson.metadata === 'object') {
      manifestJson.metadata = { ...manifestJson.metadata };
      delete manifestJson.metadata._adminVerified;
    }

    const manifestData = {
      json: manifestJson,
      created_at: new Date().toISOString(),
    };

    // Validate interfaces structure before storage to prevent partial writes
    if (manifestJson.interfaces) {
      if (
        manifestJson.interfaces.exports !== undefined &&
        manifestJson.interfaces.exports !== null &&
        !Array.isArray(manifestJson.interfaces.exports)
      ) {
        throw new Error(
          'Invalid interfaces.exports: must be an array or undefined/null'
        );
      }
      if (
        manifestJson.interfaces.uses !== undefined &&
        manifestJson.interfaces.uses !== null &&
        !Array.isArray(manifestJson.interfaces.uses)
      ) {
        throw new Error(
          'Invalid interfaces.uses: must be an array or undefined/null'
        );
      }
    }

    // Validate services structure before storage to prevent partial writes.
    // Services are optional; when present they must be an array of named
    // entries each carrying a wasm artifact. The backend is the authoritative
    // store, so it enforces the same name rules as the CLI (charset, length,
    // reserved "app") — a client bypassing the CLI must not be able to persist
    // a name like "../evil" or "app" that becomes a filesystem path segment
    // when a consumer later unpacks the bundle.
    //
    // NOTE: SERVICE_NAME_RE and these rules are mirrored in the CLI's
    // packages/cli/src/lib/services.ts (validateServiceName). The two are not
    // shared at the module level (CJS backend vs ESM/TS CLI build), so keep
    // them in sync — any change here must be reflected there and vice versa.
    // The name is validated as-is (not trimmed): the regex already rejects
    // whitespace, and trimming server-side would diverge the stored manifest
    // from the bytes the signature was computed over.
    if (manifestJson.services !== undefined && manifestJson.services !== null) {
      if (!Array.isArray(manifestJson.services)) {
        throw new Error('Invalid services: must be an array or undefined/null');
      }
      const SERVICE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
      const seenNames = new Set();
      for (const svc of manifestJson.services) {
        if (!svc || typeof svc !== 'object' || Array.isArray(svc)) {
          throw new Error('Invalid service: each service must be an object');
        }
        if (typeof svc.name !== 'string' || svc.name.length === 0) {
          throw new Error('Invalid service: missing or empty name');
        }
        if (
          !SERVICE_NAME_RE.test(svc.name) ||
          svc.name.length > 64 ||
          svc.name === 'app'
        ) {
          throw new Error(
            `Invalid service name "${svc.name}": must match ^[a-z0-9][a-z0-9_-]*$, be at most 64 chars, and not be "app"`
          );
        }
        if (seenNames.has(svc.name)) {
          throw new Error(`Invalid service: duplicate name "${svc.name}"`);
        }
        seenNames.add(svc.name);
        if (
          !svc.wasm ||
          typeof svc.wasm !== 'object' ||
          Array.isArray(svc.wasm)
        ) {
          throw new Error(
            `Invalid service "${svc.name}": missing wasm artifact`
          );
        }
        // Validate artifact paths so a client bypassing the CLI can't persist
        // a wasm/abi path like '../../etc/passwd' that a downstream consumer
        // might trust when reconstructing files. Mirrors the CLI's
        // assertSafeBundlePath (packages/cli/src/lib/services.ts). Service
        // artifacts must also live under `services/` so they can't collide
        // with the main app's `app.wasm` / `abi.json`.
        if (
          isUnsafeBundlePath(svc.wasm.path) ||
          !underServicesDir(svc.wasm.path)
        ) {
          throw new Error(
            `Invalid service "${svc.name}": wasm.path "${svc.wasm.path}" must be a safe relative path under services/`
          );
        }
        if (svc.abi !== undefined && svc.abi !== null) {
          if (typeof svc.abi !== 'object' || Array.isArray(svc.abi)) {
            throw new Error(
              `Invalid service "${svc.name}": abi must be an artifact object`
            );
          }
          if (
            isUnsafeBundlePath(svc.abi.path) ||
            !underServicesDir(svc.abi.path)
          ) {
            throw new Error(
              `Invalid service "${svc.name}": abi.path "${svc.abi.path}" must be a safe relative path under services/`
            );
          }
        }
      }
    }

    // Upload the binary to GCS BEFORE writing the manifest, so a manifest can
    // never exist in Redis without its blob in the bucket. If the upload throws,
    // we bail out here and nothing is written. (Re-uploading the same
    // package@version is idempotent — identical, immutable bytes to the same key.)
    if (_binary) {
      await blob.putBinary(key, Buffer.from(_binary, 'hex'));
    }

    const bundleKey = `bundle:${key}`;

    if (overwrite) {
      // Direct set - will overwrite
      await kv.set(bundleKey, JSON.stringify(manifestData));
    } else {
      // 1. Atomic check-and-set: Store manifest only if it doesn't exist
      const wasSet = await kv.setNX(bundleKey, JSON.stringify(manifestData));

      // setNX returns boolean: true if key was set, false if key already exists
      // Handle both boolean (node-redis v4+) and integer (legacy) return types
      if (!wasSet || wasSet === 0) {
        // Key already exists - first-come-first-serve policy
        throw new Error(
          `Bundle ${manifest.package}@${manifest.appVersion} already exists. First-come-first-serve policy.`
        );
      }
    }

    // 2. Index interfaces (exports) - safe to iterate after validation
    if (
      manifestJson.interfaces &&
      Array.isArray(manifestJson.interfaces.exports) &&
      manifestJson.interfaces.exports.length > 0
    ) {
      for (const iface of manifestJson.interfaces.exports) {
        if (typeof iface === 'string' && iface.trim().length > 0) {
          await kv.sAdd(`provides:${iface}`, key);
        }
      }
    }

    // 3. Index interfaces (uses) - safe to iterate after validation
    if (
      manifestJson.interfaces &&
      Array.isArray(manifestJson.interfaces.uses) &&
      manifestJson.interfaces.uses.length > 0
    ) {
      for (const iface of manifestJson.interfaces.uses) {
        if (typeof iface === 'string' && iface.trim().length > 0) {
          await kv.sAdd(`uses:${iface}`, key);
        }
      }
    }

    // 4. Track bundle versions
    await kv.sAdd(`bundle-versions:${manifest.package}`, manifest.appVersion);

    // 5. Global bundles list
    await kv.sAdd('bundles:all', manifest.package);

    return manifestData;
  }

  /**
   * Get V2 Bundle Binary by package and version
   */
  async getBundleBinary(pkg, version) {
    const key = `${pkg}/${version}`;
    // Read from GCS first; return a hex string so the artifact route's
    // `Buffer.from(binaryHex, 'hex')` decode stays unchanged.
    const buf = await blob.getBinary(key);
    if (buf) return buf.toString('hex');
    // Backward-compat: legacy bundles whose binary is still in Redis.
    return await kv.get(`binary:${key}`);
  }

  /**
   * Get V2 Bundle Manifest by package and version
   */
  async getBundleManifest(pkg, version) {
    const key = `bundle:${pkg}/${version}`;
    const data = await kv.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed.json;
  }

  /**
   * Get all versions for a bundle package
   * Returns versions sorted in descending order (newest first)
   */
  async getBundleVersions(pkg) {
    const versions = await kv.sMembers(`bundle-versions:${pkg}`);
    return versions.sort((a, b) => {
      // Use semver for proper version comparison (handles pre-release, build metadata, etc.)
      const aValid = semver.valid(a);
      const bValid = semver.valid(b);

      // If both are valid semver, use semver comparison
      if (aValid && bValid) {
        return semver.rcompare(aValid, bValid); // Reverse compare for descending order
      }

      // If only one is valid, prefer the valid one
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;

      // If neither is valid, fall back to string comparison
      return b.localeCompare(a, undefined, { numeric: true });
    });
  }

  /**
   * Get all bundle packages
   */
  async getAllBundles() {
    return await kv.sMembers('bundles:all');
  }

  /**
   * Check if bundle exists
   */
  async bundleExists(pkg, version) {
    const key = `bundle:${pkg}/${version}`;
    const data = await kv.get(key);
    return !!data;
  }

  /**
   * Get all bundle keys efficiently for stats
   * Returns array of {package, version} objects
   */
  async getAllBundleKeys() {
    const packages = await this.getAllBundles();

    // Fetch all version sets in parallel
    const versionPromises = packages.map(async pkg => {
      const versions = await this.getBundleVersions(pkg);
      return versions.map(version => ({ package: pkg, version }));
    });

    const versionArrays = await Promise.all(versionPromises);
    return versionArrays.flat();
  }

  /**
   * Batch get multiple bundle manifests
   * More efficient than individual getBundleManifest calls
   */
  async getBundleManifestsBatch(bundleKeys) {
    // Fetch all manifests in parallel
    const manifestPromises = bundleKeys.map(({ package: pkg, version }) =>
      this.getBundleManifest(pkg, version)
    );
    return Promise.all(manifestPromises);
  }

  /**
   * Resolve the manifests a listing endpoint needs in a FIXED number of Redis
   * round trips (3) rather than 2 per package.
   *
   * node-redis flushes every command issued in the same event-loop tick as one
   * pipelined write, so each `Promise.all` fan-out below costs a single round
   * trip no matter how many packages exist. Awaiting inside a `for` loop
   * instead — as the listing endpoints used to — serialises them, which on a
   * cross-region Redis (~85ms RTT) turned 50 packages into ~9.6s.
   *
   * KNOWN GAP: `includeYanked` is currently only requested by the all-versions
   * query, so the default per-package-latest listing never resolves yank
   * status. A latest version that has been yanked (e.g. for a security issue)
   * is therefore presented like any healthy release and is not filtered out.
   * Enabling it for the browse listing is cheap — the lookups ride the same
   * pipelined round trip — but it adds a field to the most-consumed endpoint's
   * response, so it wants to be a deliberate API change rather than a
   * side effect. Pinned in tests/bundle-listing-parity.test.js.
   *
   * @param {object}  [opts]
   * @param {string}  [opts.package]      Restrict to a single package.
   * @param {boolean} [opts.allVersions]  Every version instead of just latest.
   * @param {boolean} [opts.includeYanked] Also resolve each version's yank flag.
   * @returns {Promise<Array<{packageName: string, version: string, bundle: object, yanked?: boolean}>>}
   *          Ordered by package (as stored), then version descending. Versions
   *          whose manifest has since been deleted are dropped.
   */
  async listBundleManifests({
    package: pkg = null,
    allVersions = false,
    includeYanked = false,
  } = {}) {
    // Round 1: the package index.
    const allPackages = await this.getAllBundles();
    const targets = pkg ? allPackages.filter(p => p === pkg) : allPackages;
    if (targets.length === 0) return [];

    // Round 2: every package's version set at once.
    const versionLists = await Promise.all(
      targets.map(p => this.getBundleVersions(p))
    );

    const wanted = [];
    targets.forEach((packageName, i) => {
      // getBundleVersions already sorts descending, so [0] is the latest.
      const versions = versionLists[i];
      if (versions.length === 0) return;
      for (const version of allVersions ? versions : [versions[0]]) {
        wanted.push({ packageName, version });
      }
    });
    if (wanted.length === 0) return [];

    // Round 3: every manifest, plus every yank flag, in one pipelined flush.
    const [manifests, yankFlags] = await Promise.all([
      this.getBundleManifestsBatch(
        wanted.map(w => ({ package: w.packageName, version: w.version }))
      ),
      includeYanked
        ? Promise.all(
            wanted.map(w =>
              kv.get(`bundle-yanked:${w.packageName}/${w.version}`)
            )
          )
        : Promise.resolve([]),
    ]);

    return wanted
      .map((w, i) => ({
        packageName: w.packageName,
        version: w.version,
        bundle: manifests[i],
        ...(includeYanked ? { yanked: yankFlags[i] === '1' } : {}),
      }))
      .filter(entry => entry.bundle);
  }

  /**
   * Record a retired name/version so a later publish can be refused. Idempotent
   * (set membership), so replaying a delete is harmless.
   */
  async tombstonePackage(pkg) {
    await kv.sAdd(TOMBSTONE_SET, pkg);
  }

  async tombstoneVersion(pkg, version) {
    await kv.sAdd(TOMBSTONE_SET, `${pkg}/${version}`);
  }

  /**
   * True if a whole package name, or that specific version, has been deleted.
   * The publish routes call this before storing so a deleted name cannot be
   * re-registered and a deleted version cannot be replayed back into existence.
   * `sIsMember` is optional-chained so a stripped-down test double that never
   * tombstones simply reads as "not retired".
   */
  async isRetired(pkg, version = null) {
    if (await kv.sIsMember?.(TOMBSTONE_SET, pkg)) return true;
    if (version && (await kv.sIsMember?.(TOMBSTONE_SET, `${pkg}/${version}`))) {
      return true;
    }
    return false;
  }

  /**
   * Delete a specific version of a bundle package.
   * Cleans up the manifest, binary, version index, interface indexes,
   * and the global package list if no versions remain.
   */
  async deleteBundleVersion(pkg, version) {
    const key = `${pkg}/${version}`;

    // Read manifest before deletion so we can clean up interface indexes
    const manifest = await this.getBundleManifest(pkg, version);

    // Remove manifest and binary
    await kv.del(`bundle:${key}`);
    await kv.del(`binary:${key}`); // clears legacy Redis copy if present
    await blob.deleteBinary(key); // clears GCS object

    // Remove from version set
    await kv.sRem(`bundle-versions:${pkg}`, version);

    // Clean up interface indexes
    if (manifest?.interfaces?.exports) {
      for (const iface of manifest.interfaces.exports) {
        if (typeof iface === 'string') await kv.sRem(`provides:${iface}`, key);
      }
    }
    if (manifest?.interfaces?.uses) {
      for (const iface of manifest.interfaces.uses) {
        if (typeof iface === 'string') await kv.sRem(`uses:${iface}`, key);
      }
    }

    // Retire this exact version so a replay of the same bytes cannot silently
    // resurrect it under the old package's trust. (A whole-package delete also
    // retires the bare name — see deletePackage.)
    await this.tombstoneVersion(pkg, version);

    // If no versions remain, remove package from global list and clean up version set
    const remaining = await kv.sMembers(`bundle-versions:${pkg}`);
    if (remaining.length === 0) {
      await kv.del(`bundle-versions:${pkg}`);
      await kv.sRem('bundles:all', pkg);
      // Deleting the last version removes the package as effectively as a
      // whole-package delete, so retire the bare name too — otherwise the name
      // would be re-registerable and could inherit any review/org state that
      // outlives it.
      await this.tombstonePackage(pkg);
    }
  }

  /**
   * Delete all versions of a bundle package AND everything else keyed by it, so
   * nothing the package owned outlives it and gets re-attached to a same-named
   * republish. This is the one cleanup routine both delete paths (the
   * user-facing route and the admin route) call, so the two cannot drift and
   * leave one path leaking review state, assets or the org link.
   */
  async deletePackage(pkg) {
    const versions = await this.getBundleVersions(pkg);
    for (const version of versions) {
      await this.deleteBundleVersion(pkg, version);
    }

    // Retire the name itself: a later publish of the same package is refused
    // rather than inheriting this one's trust, assets and org link.
    await this.tombstonePackage(pkg);

    // Download counter, the review decision (with its legacy key and its
    // membership in the decided set), user-uploaded assets, and the org link
    // (which also de-indexes the package from the org's package set). Assets are
    // best-effort so a bucket hiccup never blocks the Redis cleanup.
    await kv.del(`downloads:${pkg.toLowerCase()}`);
    await kv.del(reviewKey(pkg));
    await kv.del(legacyKey(pkg));
    await kv.sRem?.(DECIDED_SET, pkg);
    await removeAllAssets(pkg).catch(() => {});
    await deletePkg2Org(pkg);
  }
}

module.exports = { BundleStorageKV };
