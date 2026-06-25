/**
 * Bundle Storage Implementation with Vercel KV
 *
 * Persistent storage for V2 bundles using Vercel KV (Redis).
 */

const { kv } = require('./kv-client');
const blob = require('./blob-store');
const semver = require('semver');

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
        // assertSafeBundlePath (packages/cli/src/lib/services.ts).
        if (isUnsafeBundlePath(svc.wasm.path)) {
          throw new Error(
            `Invalid service "${svc.name}": unsafe wasm.path "${svc.wasm.path}"`
          );
        }
        if (svc.abi !== undefined && svc.abi !== null) {
          if (typeof svc.abi !== 'object' || Array.isArray(svc.abi)) {
            throw new Error(
              `Invalid service "${svc.name}": abi must be an artifact object`
            );
          }
          if (isUnsafeBundlePath(svc.abi.path)) {
            throw new Error(
              `Invalid service "${svc.name}": unsafe abi.path "${svc.abi.path}"`
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

    // If no versions remain, remove package from global list and clean up version set
    const remaining = await kv.sMembers(`bundle-versions:${pkg}`);
    if (remaining.length === 0) {
      await kv.del(`bundle-versions:${pkg}`);
      await kv.sRem('bundles:all', pkg);
    }
  }

  /**
   * Delete all versions of a bundle package.
   */
  async deletePackage(pkg) {
    const versions = await this.getBundleVersions(pkg);
    for (const version of versions) {
      await this.deleteBundleVersion(pkg, version);
    }
  }
}

module.exports = { BundleStorageKV };
