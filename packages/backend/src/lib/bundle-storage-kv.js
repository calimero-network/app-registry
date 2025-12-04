/**
 * Bundle Storage Implementation with Vercel KV
 *
 * Persistent storage for V2 bundles using Vercel KV (Redis).
 */

const { kv } = require('./kv-client');

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

    // 1. Store manifest
    await kv.set(`bundle:${key}`, JSON.stringify(manifestData));

    // 2. Index interfaces (exports)
    if (manifest.interfaces && manifest.interfaces.exports) {
      for (const iface of manifest.interfaces.exports) {
        await kv.sAdd(`provides:${iface}`, key);
      }
    }

    // 3. Index interfaces (uses)
    if (manifest.interfaces && manifest.interfaces.uses) {
      for (const iface of manifest.interfaces.uses) {
        await kv.sAdd(`uses:${iface}`, key);
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
   */
  async getBundleVersions(pkg) {
    const versions = await kv.sMembers(`bundle-versions:${pkg}`);
    return versions.sort((a, b) => {
      // Simple semver-like sorting (can be improved)
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return bVal - aVal;
      }
      return 0;
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
