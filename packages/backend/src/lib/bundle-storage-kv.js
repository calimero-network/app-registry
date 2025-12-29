/**
 * Bundle Storage Implementation with Vercel KV
 *
 * Persistent storage for V2 bundles using Vercel KV (Redis).
 */

const { kv } = require('./kv-client');
const semver = require('semver');

class BundleStorageKV {
  constructor() {
    // No in-memory state needed - all operations use KV
  }

  /**
   * Store a V2 Bundle Manifest
   * Uses atomic SETNX to prevent race conditions
   * @throws {Error} If bundle already exists (first-come-first-serve)
   */
  async storeBundleManifest(manifest) {
    const key = `${manifest.package}/${manifest.appVersion}`;
    const manifestData = {
      json: manifest,
      created_at: new Date().toISOString(),
    };

    // Validate interfaces structure before storage to prevent partial writes
    if (manifest.interfaces) {
      if (
        manifest.interfaces.exports !== undefined &&
        manifest.interfaces.exports !== null &&
        !Array.isArray(manifest.interfaces.exports)
      ) {
        throw new Error(
          'Invalid interfaces.exports: must be an array or undefined/null'
        );
      }
      if (
        manifest.interfaces.uses !== undefined &&
        manifest.interfaces.uses !== null &&
        !Array.isArray(manifest.interfaces.uses)
      ) {
        throw new Error(
          'Invalid interfaces.uses: must be an array or undefined/null'
        );
      }
    }

    // 1. Atomic check-and-set: Store manifest only if it doesn't exist
    const bundleKey = `bundle:${key}`;
    const wasSet = await kv.setNX(bundleKey, JSON.stringify(manifestData));

    // setNX returns boolean: true if key was set, false if key already exists
    // Handle both boolean (node-redis v4+) and integer (legacy) return types
    if (!wasSet || wasSet === 0) {
      // Key already exists - first-come-first-serve policy
      throw new Error(
        `Bundle ${manifest.package}@${manifest.appVersion} already exists. First-come-first-serve policy.`
      );
    }

    // 2. Index interfaces (exports) - safe to iterate after validation
    if (
      manifest.interfaces &&
      Array.isArray(manifest.interfaces.exports) &&
      manifest.interfaces.exports.length > 0
    ) {
      for (const iface of manifest.interfaces.exports) {
        if (typeof iface === 'string' && iface.trim().length > 0) {
          await kv.sAdd(`provides:${iface}`, key);
        }
      }
    }

    // 3. Index interfaces (uses) - safe to iterate after validation
    if (
      manifest.interfaces &&
      Array.isArray(manifest.interfaces.uses) &&
      manifest.interfaces.uses.length > 0
    ) {
      for (const iface of manifest.interfaces.uses) {
        if (typeof iface === 'string' && iface.trim().length > 0) {
          await kv.sAdd(`uses:${iface}`, key);
        }
      }
    }

    // 4. Track bundle versions
    await kv.sAdd(`bundle-versions:${manifest.package}`, manifest.appVersion);

    // 5. Global bundles list
    await kv.sAdd('bundles:all', manifest.package);

    // 6. Store binary if provided (as hex string)
    if (manifest._binary) {
      await kv.set(`binary:${key}`, manifest._binary);
    }

    return manifestData;
  }

  /**
   * Get V2 Bundle Binary by package and version
   */
  async getBundleBinary(pkg, version) {
    const key = `binary:${pkg}/${version}`;
    return await kv.get(key);
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
}

module.exports = { BundleStorageKV };
