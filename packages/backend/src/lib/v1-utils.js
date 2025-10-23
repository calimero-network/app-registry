/**
 * V1 Utility Functions
 *
 * Implements JCS canonicalization, Ed25519 verification, digest validation,
 * and dependency resolution for the v1 API.
 */

// Dynamic import for ES module
let ed25519;
const semver = require('semver');
// const crypto = require('crypto');

class V1Utils {
  /**
   * Canonicalize JSON for JCS (RFC 8785-like)
   */
  static canonicalize(obj) {
    // Remove signature for canonicalization
    // eslint-disable-next-line no-unused-vars
    const { signature, ...canonicalObj } = obj;
    return JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
  }

  /**
   * Verify Ed25519 signature
   */
  static async verifySignature(manifest) {
    if (!manifest.signature) {
      return { valid: true, error: null };
    }

    try {
      // Dynamic import for ES module
      if (!ed25519) {
        const nobleEd25519 = await import('@noble/ed25519');
        ed25519 = nobleEd25519.ed25519;
      }

      const canonical = this.canonicalize(manifest);
      const signature = Buffer.from(
        manifest.signature.sig.replace('base64:', ''),
        'base64'
      );
      const pubkey = Buffer.from(
        manifest.signature.pubkey.replace('ed25519:', ''),
        'base64'
      );

      const isValid = await ed25519.verify(
        signature,
        Buffer.from(canonical),
        pubkey
      );

      if (!isValid) {
        return {
          valid: false,
          error: `ed25519 verify failed for pubkey ${manifest.signature.pubkey}`,
        };
      }

      return { valid: true, error: null };
    } catch (error) {
      return {
        valid: false,
        error: `Signature verification error: ${error.message}`,
      };
    }
  }

  /**
   * Validate SHA256 digest format
   */
  static validateDigest(digest) {
    const digestPattern = /^sha256:[0-9a-f]{64}$/;
    return digestPattern.test(digest);
  }

  /**
   * Validate artifact URI format
   */
  static validateUri(uri) {
    const uriPattern = /^(https:\/\/|ipfs:\/\/)/;
    return uriPattern.test(uri);
  }

  /**
   * Validate artifact digest format (without fetching)
   * Note: Actual artifact fetching would require additional dependencies
   */
  static validateArtifactDigest(artifact) {
    if (!artifact.digest || !artifact.uri) {
      return { valid: false, error: 'Missing digest or URI' };
    }

    // Validate digest format
    if (!this.validateDigest(artifact.digest)) {
      return { valid: false, error: 'Invalid digest format' };
    }

    // Validate URI format
    if (!this.validateUri(artifact.uri)) {
      return { valid: false, error: 'Invalid URI format' };
    }

    return { valid: true, error: null };
  }

  /**
   * Validate semver version
   */
  static validateVersion(version) {
    return semver.valid(version) !== null;
  }

  /**
   * Validate semver range
   */
  static validateRange(range) {
    return semver.validRange(range) !== null;
  }

  /**
   * Resolve dependencies using semver
   */
  static resolveDependencies(manifest, availableManifests) {
    const plan = [];
    const installed = new Set();
    const visited = new Set();

    // Add root manifest to plan
    plan.push({
      action: 'install',
      id: manifest.id,
      version: manifest.version,
    });
    installed.add(`${manifest.id}@${manifest.version}`);

    // Resolve dependencies recursively
    this.resolveDependency(
      manifest,
      availableManifests,
      plan,
      installed,
      visited
    );

    return plan;
  }

  /**
   * Resolve a single dependency
   */
  static resolveDependency(
    manifest,
    availableManifests,
    plan,
    installed,
    visited
  ) {
    if (!manifest.dependencies) {
      return;
    }

    for (const dep of manifest.dependencies) {
      const depKey = `${dep.id}@${dep.range}`;

      if (visited.has(depKey)) {
        continue; // Avoid infinite recursion
      }
      visited.add(depKey);

      // Find compatible versions
      const compatibleVersions = availableManifests
        .filter(m => m.id === dep.id)
        .map(m => m.version)
        .filter(v => semver.satisfies(v, dep.range));

      if (compatibleVersions.length === 0) {
        throw new Error(
          `No compatible versions found for ${dep.id}@${dep.range}`
        );
      }

      // Get highest compatible version
      const selectedVersion = semver.maxSatisfying(
        compatibleVersions,
        dep.range
      );
      const installKey = `${dep.id}@${selectedVersion}`;

      if (!installed.has(installKey)) {
        plan.push({
          action: 'install',
          id: dep.id,
          version: selectedVersion,
        });
        installed.add(installKey);

        // Recursively resolve dependencies of this dependency
        const depManifest = availableManifests.find(
          m => m.id === dep.id && m.version === selectedVersion
        );

        if (depManifest) {
          this.resolveDependency(
            depManifest,
            availableManifests,
            plan,
            installed,
            visited
          );
        }
      }
    }
  }

  /**
   * Check interface requirements
   */
  static checkInterfaceRequirements(manifests) {
    const provides = new Set();
    const requires = new Set();

    // Collect all provides and requires
    for (const manifest of manifests) {
      if (manifest.provides) {
        for (const provide of manifest.provides) {
          provides.add(provide);
        }
      }
      if (manifest.requires) {
        for (const require of manifest.requires) {
          requires.add(require);
        }
      }
    }

    // Check which requirements are satisfied
    const satisfies = [];
    const missing = [];

    for (const require of requires) {
      if (provides.has(require)) {
        satisfies.push(require);
      } else {
        missing.push(require);
      }
    }

    return { satisfies, missing };
  }

  /**
   * Detect cycles in dependency graph
   */
  static detectCycles(manifests) {
    const graph = new Map();
    const visited = new Set();
    const recStack = new Set();

    // Build dependency graph
    for (const manifest of manifests) {
      if (manifest.dependencies) {
        const deps = manifest.dependencies.map(dep => dep.id);
        graph.set(`${manifest.id}@${manifest.version}`, deps);
      }
    }

    // DFS to detect cycles
    const hasCycle = node => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const deps = graph.get(node) || [];
      for (const dep of deps) {
        if (hasCycle(dep)) return true;
      }

      recStack.delete(node);
      return false;
    };

    // Check all nodes for cycles
    for (const node of graph.keys()) {
      if (hasCycle(node)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate manifest structure
   */
  static validateManifest(manifest) {
    const errors = [];

    // Check required fields
    if (!manifest.manifest_version || manifest.manifest_version !== '1.0') {
      errors.push('manifest_version must be "1.0"');
    }

    if (!manifest.id) {
      errors.push('id is required');
    }

    if (!manifest.name) {
      errors.push('name is required');
    }

    if (!manifest.version) {
      errors.push('version is required');
    }

    if (
      !manifest.chains ||
      !Array.isArray(manifest.chains) ||
      manifest.chains.length === 0
    ) {
      errors.push('chains is required and must be a non-empty array');
    }

    if (!manifest.artifact) {
      errors.push('artifact is required');
    } else {
      if (!manifest.artifact.type || manifest.artifact.type !== 'wasm') {
        errors.push('artifact.type must be "wasm"');
      }

      if (!manifest.artifact.target || manifest.artifact.target !== 'node') {
        errors.push('artifact.target must be "node"');
      }

      if (!manifest.artifact.digest) {
        errors.push('artifact.digest is required');
      } else if (!this.validateDigest(manifest.artifact.digest)) {
        errors.push('artifact.digest must be in format "sha256:<64hex>"');
      }

      if (!manifest.artifact.uri) {
        errors.push('artifact.uri is required');
      } else if (!this.validateUri(manifest.artifact.uri)) {
        errors.push('artifact.uri must start with "https://" or "ipfs://"');
      }
    }

    // Validate version format
    if (manifest.version && !this.validateVersion(manifest.version)) {
      errors.push('version must be a valid semver');
    }

    // Validate dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!dep.id) {
          errors.push('dependency.id is required');
        }
        if (!dep.range) {
          errors.push('dependency.range is required');
        } else if (!this.validateRange(dep.range)) {
          errors.push(
            `dependency.range "${dep.range}" is not a valid semver range`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = { V1Utils };
