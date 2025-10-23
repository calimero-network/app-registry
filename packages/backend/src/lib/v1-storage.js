/**
 * V1 Storage Model Implementation
 *
 * Implements the storage model for the v1 API with proper indexing
 * for manifests, provides, requires, and dependencies.
 */

class V1Storage {
  constructor() {
    // Core storage
    this.manifests = new Map(); // key: `${id}/${version}`, value: manifest data
    this.apps = new Map(); // key: app id, value: app metadata

    // Indexes for fast lookups
    this.providesIndex = new Map(); // key: `${id}/${version}`, value: provides array
    this.requiresIndex = new Map(); // key: `${id}/${version}`, value: requires array
    this.depsIndex = new Map(); // key: `${id}/${version}`, value: dependencies array

    // Version tracking per app
    this.appVersions = new Map(); // key: app id, value: Set of versions
  }

  /**
   * Store a manifest with all indexes
   */
  storeManifest(manifest) {
    const key = `${manifest.id}/${manifest.version}`;
    const manifestData = {
      json: manifest,
      canonical_jcs_base64: this.canonicalize(manifest),
      pubkey: manifest.signature?.pubkey || null,
      artifact_digest: manifest.artifact.digest,
      artifact_uri: manifest.artifact.uri,
      created_at: new Date().toISOString(),
    };

    // Store manifest
    this.manifests.set(key, manifestData);

    // Update app metadata
    this.updateAppMetadata(manifest);

    // Update indexes
    this.updateIndexes(manifest);

    return manifestData;
  }

  /**
   * Get manifest by id and version
   */
  getManifest(id, version) {
    const key = `${id}/${version}`;
    const manifestData = this.manifests.get(key);
    return manifestData ? manifestData.json : null;
  }

  /**
   * Get all versions for an app
   */
  getAppVersions(id) {
    const versions = this.appVersions.get(id);
    return versions
      ? Array.from(versions).sort((a, b) => {
          // Sort versions in descending order (newest first)
          return this.compareVersions(b, a);
        })
      : [];
  }

  /**
   * Check if manifest exists
   */
  hasManifest(id, version) {
    const key = `${id}/${version}`;
    return this.manifests.has(key);
  }

  /**
   * Get all apps
   */
  getApps() {
    return Array.from(this.apps.values());
  }

  /**
   * Get all manifests
   */
  getAllManifests() {
    const manifests = [];
    for (const [, manifestData] of this.manifests) {
      manifests.push(manifestData.json);
    }
    return manifests;
  }

  /**
   * Search manifests by query
   */
  searchManifests(query) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const [, manifestData] of this.manifests) {
      const manifest = manifestData.json;

      // Search by id
      if (manifest.id.toLowerCase().includes(queryLower)) {
        results.push({
          id: manifest.id,
          version: manifest.version,
          provides: manifest.provides || [],
          requires: manifest.requires || [],
        });
        continue;
      }

      // Search by name
      if (manifest.name.toLowerCase().includes(queryLower)) {
        results.push({
          id: manifest.id,
          version: manifest.version,
          provides: manifest.provides || [],
          requires: manifest.requires || [],
        });
        continue;
      }

      // Search by provides
      if (manifest.provides) {
        for (const provide of manifest.provides) {
          if (provide.toLowerCase().includes(queryLower)) {
            results.push({
              id: manifest.id,
              version: manifest.version,
              provides: manifest.provides,
              requires: manifest.requires || [],
            });
            break;
          }
        }
      }

      // Search by requires
      if (manifest.requires) {
        for (const require of manifest.requires) {
          if (require.toLowerCase().includes(queryLower)) {
            results.push({
              id: manifest.id,
              version: manifest.version,
              provides: manifest.provides || [],
              requires: manifest.requires,
            });
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Get manifest with canonical JCS
   */
  getManifestWithCanonical(id, version) {
    const key = `${id}/${version}`;
    const manifestData = this.manifests.get(key);

    if (!manifestData) {
      return null;
    }

    return {
      ...manifestData.json,
      canonical_jcs: manifestData.canonical_jcs_base64,
    };
  }

  /**
   * Update app metadata
   */
  updateAppMetadata(manifest) {
    const appId = manifest.id;
    const existingApp = this.apps.get(appId);

    if (!existingApp) {
      this.apps.set(appId, {
        id: appId,
        name: manifest.name,
        latest_version: manifest.version,
        latest_cid: '', // Not used in v1
      });
    } else {
      // Update latest version if this is newer
      if (
        this.compareVersions(manifest.version, existingApp.latest_version) > 0
      ) {
        existingApp.latest_version = manifest.version;
      }
    }

    // Update version tracking
    if (!this.appVersions.has(appId)) {
      this.appVersions.set(appId, new Set());
    }
    this.appVersions.get(appId).add(manifest.version);
  }

  /**
   * Update indexes for fast lookups
   */
  updateIndexes(manifest) {
    const key = `${manifest.id}/${manifest.version}`;

    // Update provides index
    if (manifest.provides) {
      this.providesIndex.set(key, manifest.provides);
    }

    // Update requires index
    if (manifest.requires) {
      this.requiresIndex.set(key, manifest.requires);
    }

    // Update dependencies index
    if (manifest.dependencies) {
      this.depsIndex.set(key, manifest.dependencies);
    }
  }

  /**
   * Simple JCS canonicalization
   */
  canonicalize(obj) {
    // Remove signature for canonicalization
    // eslint-disable-next-line no-unused-vars
    const { signature, ...canonicalObj } = obj;
    return JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
  }

  /**
   * Compare semantic versions
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  /**
   * Get all manifests for dependency resolution
   */
  getAllManifests() {
    const manifests = [];
    for (const [, manifestData] of this.manifests) {
      manifests.push(manifestData.json);
    }
    return manifests;
  }

  /**
   * Get manifest by key for internal use
   */
  getManifestByKey(key) {
    return this.manifests.get(key);
  }

  /**
   * Clear all data (for testing)
   */
  clear() {
    this.manifests.clear();
    this.apps.clear();
    this.providesIndex.clear();
    this.requiresIndex.clear();
    this.depsIndex.clear();
    this.appVersions.clear();
  }
}

module.exports = { V1Storage };
