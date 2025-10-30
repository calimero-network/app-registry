/**
 * Optimized V1 Storage Model Implementation
 *
 * Performance-optimized storage with caching, indexing, and efficient algorithms
 * for large dependency graphs and searches.
 */

const { LRUCache } = require('lru-cache');

class V1StorageOptimized {
  constructor(options = {}) {
    // Core storage
    this.manifests = new Map();
    this.apps = new Map();

    // Performance optimizations
    this.cacheSize = options.cacheSize || 1000;
    this.searchCache = new LRUCache({ max: this.cacheSize });
    this.resolveCache = new LRUCache({ max: this.cacheSize });

    // Advanced indexing for fast lookups
    this.searchIndex = new Map(); // Full-text search index
    this.providesIndex = new Map(); // Interface -> Set of app IDs
    this.requiresIndex = new Map(); // Interface -> Set of app IDs
    this.depsIndex = new Map(); // App ID -> Set of dependencies
    this.versionIndex = new Map(); // App ID -> Sorted versions

    // Performance metrics
    this.metrics = {
      searchCount: 0,
      resolveCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Store a manifest with optimized indexing
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

    // Update all indexes
    this.updateSearchIndex(manifest);
    this.updateInterfaceIndexes(manifest);
    this.updateDependencyIndex(manifest);
    this.updateVersionIndex(manifest);

    // Clear related caches
    this.invalidateCaches(manifest.id);

    return manifestData;
  }

  /**
   * Optimized search with caching and indexing
   */
  searchManifests(query, options = {}) {
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;

    // Check cache first
    if (this.searchCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      return this.searchCache.get(cacheKey);
    }

    this.metrics.cacheMisses++;
    this.metrics.searchCount++;

    const results = this.performOptimizedSearch(query, options);

    // Cache results
    this.searchCache.set(cacheKey, results);

    return results;
  }

  /**
   * Perform optimized search using indexes
   */
  performOptimizedSearch(query, options = {}) {
    const queryLower = query.toLowerCase();
    const results = new Set();
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    // Use search index for fast text matching
    if (this.searchIndex.has(queryLower)) {
      const matches = this.searchIndex.get(queryLower);
      for (const key of matches) {
        const manifestData = this.manifests.get(key);
        if (manifestData) {
          results.add(this.formatSearchResult(manifestData.json));
        }
      }
    } else {
      // Fallback to full search with early termination
      let count = 0;
      for (const [, manifestData] of this.manifests) {
        if (count >= limit + offset) break;

        const manifest = manifestData.json;
        if (this.matchesQuery(manifest, queryLower)) {
          if (count >= offset) {
            results.add(this.formatSearchResult(manifest));
          }
          count++;
        }
      }
    }

    return Array.from(results).slice(0, limit);
  }

  /**
   * Update search index for fast text matching
   */
  updateSearchIndex(manifest) {
    const key = `${manifest.id}/${manifest.version}`;
    const searchTerms = [
      manifest.id,
      manifest.name,
      ...(manifest.provides || []),
      ...(manifest.requires || []),
    ];

    for (const term of searchTerms) {
      const termLower = term.toLowerCase();
      if (!this.searchIndex.has(termLower)) {
        this.searchIndex.set(termLower, new Set());
      }
      this.searchIndex.get(termLower).add(key);
    }
  }

  /**
   * Update interface indexes for fast interface lookups
   */
  updateInterfaceIndexes(manifest) {
    // const key = `${manifest.id}/${manifest.version}`;

    // Update provides index
    if (manifest.provides) {
      for (const provide of manifest.provides) {
        if (!this.providesIndex.has(provide)) {
          this.providesIndex.set(provide, new Set());
        }
        this.providesIndex.get(provide).add(manifest.id);
      }
    }

    // Update requires index
    if (manifest.requires) {
      for (const require of manifest.requires) {
        if (!this.requiresIndex.has(require)) {
          this.requiresIndex.set(require, new Set());
        }
        this.requiresIndex.get(require).add(manifest.id);
      }
    }
  }

  /**
   * Update dependency index for fast dependency resolution
   */
  updateDependencyIndex(manifest) {
    if (manifest.dependencies) {
      const deps = new Set();
      for (const dep of manifest.dependencies) {
        deps.add(dep.id);
      }
      this.depsIndex.set(manifest.id, deps);
    }
  }

  /**
   * Update version index for fast version lookups
   */
  updateVersionIndex(manifest) {
    const appId = manifest.id;
    if (!this.versionIndex.has(appId)) {
      this.versionIndex.set(appId, []);
    }

    const versions = this.versionIndex.get(appId);
    versions.push(manifest.version);
    versions.sort((a, b) => this.compareVersions(b, a)); // Sort descending
  }

  /**
   * Optimized dependency resolution with caching
   */
  resolveDependencies(rootId, rootVersion, installed = []) {
    const cacheKey = `resolve:${rootId}:${rootVersion}:${JSON.stringify(installed)}`;

    // Check cache first
    if (this.resolveCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      return this.resolveCache.get(cacheKey);
    }

    this.metrics.cacheMisses++;
    this.metrics.resolveCount++;

    const result = this.performOptimizedResolution(
      rootId,
      rootVersion,
      installed
    );

    // Cache results
    this.resolveCache.set(cacheKey, result);

    return result;
  }

  /**
   * Perform optimized dependency resolution
   */
  performOptimizedResolution(rootId, rootVersion, _installed) {
    const resolution = new Map();
    const queue = [{ id: rootId, version: rootVersion }];
    const visited = new Set();
    const conflicts = [];

    while (queue.length > 0) {
      const current = queue.shift();
      const currentKey = `${current.id}/${current.version}`;

      if (visited.has(currentKey)) continue;
      visited.add(currentKey);

      // Get manifest
      const manifest = this.getManifest(current.id, current.version);
      if (!manifest) {
        conflicts.push(`Manifest not found: ${current.id}@${current.version}`);
        continue;
      }

      // Add to resolution
      resolution.set(current.id, {
        id: current.id,
        version: current.version,
        manifest,
      });

      // Process dependencies
      if (manifest.dependencies) {
        for (const dep of manifest.dependencies) {
          const compatibleVersions = this.findCompatibleVersions(
            dep.id,
            dep.range
          );

          if (compatibleVersions.length === 0) {
            conflicts.push(`No compatible versions for ${dep.id}@${dep.range}`);
            continue;
          }

          const selectedVersion = compatibleVersions[0];
          queue.push({ id: dep.id, version: selectedVersion });
        }
      }
    }

    return {
      plan: Array.from(resolution.values()).map(item => ({
        action: 'install',
        id: item.id,
        version: item.version,
      })),
      conflicts,
    };
  }

  /**
   * Find compatible versions for a dependency
   */
  findCompatibleVersions(appId, range) {
    const versions = this.versionIndex.get(appId) || [];
    const semver = require('semver');

    return versions
      .filter(version => semver.satisfies(version, range))
      .sort((a, b) => semver.rcompare(a, b));
  }

  /**
   * Get app versions with optimized sorting
   */
  getAppVersions(appId) {
    const versions = this.versionIndex.get(appId) || [];
    return {
      id: appId,
      versions,
    };
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
        latest_cid: '',
      });
    } else {
      if (
        this.compareVersions(manifest.version, existingApp.latest_version) > 0
      ) {
        existingApp.latest_version = manifest.version;
      }
    }
  }

  /**
   * Invalidate caches for an app
   */
  invalidateCaches(appId) {
    // Remove search cache entries that might be affected
    const searchKeys = Array.from(this.searchCache.keys());
    for (const key of searchKeys) {
      if (key.includes(appId)) {
        this.searchCache.delete(key);
      }
    }

    // Remove resolve cache entries that might be affected
    const resolveKeys = Array.from(this.resolveCache.keys());
    for (const key of resolveKeys) {
      if (key.includes(appId)) {
        this.resolveCache.delete(key);
      }
    }
  }

  /**
   * Check if manifest matches query
   */
  matchesQuery(manifest, queryLower) {
    return (
      manifest.id.toLowerCase().includes(queryLower) ||
      manifest.name.toLowerCase().includes(queryLower) ||
      (manifest.provides &&
        manifest.provides.some(p => p.toLowerCase().includes(queryLower))) ||
      (manifest.requires &&
        manifest.requires.some(r => r.toLowerCase().includes(queryLower)))
    );
  }

  /**
   * Format search result
   */
  formatSearchResult(manifest) {
    return {
      id: manifest.id,
      version: manifest.version,
      provides: manifest.provides || [],
      requires: manifest.requires || [],
    };
  }

  /**
   * Canonicalize JSON for JCS
   */
  canonicalize(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  /**
   * Compare versions
   */
  compareVersions(version1, version2) {
    const semver = require('semver');
    return semver.compare(version1, version2);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.searchCache.size + this.resolveCache.size,
      totalManifests: this.manifests.size,
      totalApps: this.apps.size,
      searchIndexSize: this.searchIndex.size,
      providesIndexSize: this.providesIndex.size,
      requiresIndexSize: this.requiresIndex.size,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.searchCache.clear();
    this.resolveCache.clear();
  }

  /**
   * Reset all data
   */
  reset() {
    this.manifests.clear();
    this.apps.clear();
    this.searchIndex.clear();
    this.providesIndex.clear();
    this.requiresIndex.clear();
    this.depsIndex.clear();
    this.versionIndex.clear();
    this.clearCaches();
    this.metrics = {
      searchCount: 0,
      resolveCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }
}

module.exports = { V1StorageOptimized };
