/**
 * V1 Storage Model Implementation with Vercel KV
 *
 * Persistent storage using Vercel KV (Redis) instead of in-memory Maps.
 * Maintains same interface as V1Storage for compatibility.
 */

const { kv } = require('./kv-client');
const semver = require('semver');

class V1StorageKV {
  constructor() {
    // No in-memory state needed - all operations use KV
  }

  /**
   * Store a manifest with all indexes
   */
  async storeManifest(manifest) {
    const key = `${manifest.id}/${manifest.version}`;
    const manifestData = {
      json: manifest,
      canonical_jcs_base64: this.canonicalize(manifest),
      pubkey: manifest.signature?.pubkey || null,
      artifact_digest: manifest.artifact.digest,
      artifact_uri: manifest.artifact.uri,
      created_at: new Date().toISOString(),
    };

    // 1. Store manifest
    await kv.set(`manifest:${key}`, JSON.stringify(manifestData));

    // 2. Store/update app metadata
    await this.updateAppMetadata(manifest);

    // 3. Track versions
    await kv.sAdd(`versions:${manifest.id}`, manifest.version);

    // 4. Update provides index
    if (manifest.provides) {
      for (const iface of manifest.provides) {
        await kv.sAdd(`provides:${iface}`, key);
      }
    }

    // 5. Update requires index
    if (manifest.requires) {
      for (const iface of manifest.requires) {
        await kv.sAdd(`requires:${iface}`, key);
      }
    }

    // 6. Store dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        await kv.sAdd(`deps:${key}`, JSON.stringify(dep));
      }
    }

    // 7. Track this app in global apps list
    await kv.sAdd('apps:all', manifest.id);

    return manifestData;
  }

  /**
   * Get manifest by id and version
   */
  async getManifest(id, version) {
    const key = `manifest:${id}/${version}`;
    const data = await kv.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed.json;
  }

  /**
   * Get all versions for an app
   */
  async getAppVersions(id) {
    const versions = await kv.sMembers(`versions:${id}`);
    return versions.sort((a, b) => this.compareVersions(b, a));
  }

  /**
   * Check if manifest exists
   */
  async hasManifest(id, version) {
    const exists = await kv.sIsMember(`versions:${id}`, version);
    return exists === 1;
  }

  /**
   * Get all apps
   */
  async getApps() {
    const appIds = await kv.sMembers('apps:all');
    const apps = await Promise.all(
      appIds.map(async id => {
        const app = await kv.hGetAll(`app:${id}`);
        return app && app.id ? app : null;
      })
    );
    return apps.filter(a => a !== null);
  }

  /**
   * Get all manifests
   */
  async getAllManifests() {
    const appIds = await kv.sMembers('apps:all');
    const allManifests = [];

    for (const appId of appIds) {
      const versions = await kv.sMembers(`versions:${appId}`);
      for (const version of versions) {
        const manifest = await this.getManifest(appId, version);
        if (manifest) {
          allManifests.push(manifest);
        }
      }
    }

    return allManifests;
  }

  /**
   * Search manifests by query
   */
  async searchManifests(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    const allManifests = await this.getAllManifests();

    for (const manifest of allManifests) {
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
  async getManifestWithCanonical(id, version) {
    const key = `manifest:${id}/${version}`;
    const data = await kv.get(key);

    if (!data) {
      return null;
    }

    const manifestData = JSON.parse(data);
    return {
      ...manifestData.json,
      canonical_jcs: manifestData.canonical_jcs_base64,
    };
  }

  /**
   * Update app metadata
   */
  async updateAppMetadata(manifest) {
    const appId = manifest.id;
    const existingApp = await kv.hGetAll(`app:${appId}`);

    if (!existingApp || !existingApp.id) {
      // New app
      await kv.hSet(`app:${appId}`, {
        id: appId,
        name: manifest.name,
        latest_version: manifest.version,
        latest_cid: '',
      });
    } else {
      // Update if this is a newer version
      if (
        this.compareVersions(manifest.version, existingApp.latest_version) > 0
      ) {
        await kv.hSet(`app:${appId}`, {
          ...existingApp,
          latest_version: manifest.version,
        });
      }
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
    // Use semver library for proper comparison
    if (semver.valid(version1) && semver.valid(version2)) {
      return semver.compare(version1, version2);
    }

    // Fallback to simple string comparison
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
   * Clear all data (for testing)
   */
  async clear() {
    // In production KV, this would need to scan and delete all keys
    // For now, only works with mock KV
    if (kv._clear) {
      await kv._clear();
    }
  }
}

module.exports = { V1StorageKV };
