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

    // 1. Store manifest (only after validation)
    await kv.set(`bundle:${key}`, JSON.stringify(manifestData));

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

    return manifestData;
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
}

module.exports = { BundleStorageKV };
