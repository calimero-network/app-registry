/**
 * V2 Utility Functions
 *
 * Shared logic for bundle validation and canonicalization
 */

/**
 * Recursively sort object keys for canonicalization
 */
function sortKeysRecursively(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }

  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = sortKeysRecursively(obj[key]);
    });
  return sorted;
}

/**
 * Canonicalize JSON for signature verification
 */
function canonicalizeJSON(obj) {
  return JSON.stringify(sortKeysRecursively(obj));
}

/**
 * Canonicalize bundle for signature verification
 */
function canonicalizeBundle(manifest) {
  const manifestJson = { ...manifest };
  delete manifestJson.signature;
  delete manifestJson._binary;
  delete manifestJson._overwrite;

  return canonicalizeJSON({
    version: manifestJson.version,
    package: manifestJson.package,
    appVersion: manifestJson.appVersion,
    metadata: manifestJson.metadata,
    wasm: manifestJson.wasm,
    interfaces: manifestJson.interfaces || null,
    migrations: manifestJson.migrations || null,
    links: manifestJson.links || null,
  });
}

/**
 * Validate bundle manifest structure
 */
function validateBundleManifest(manifest) {
  const errors = [];

  if (!manifest) {
    errors.push('Missing manifest');
    return { valid: false, errors };
  }

  if (!manifest.version || manifest.version !== '1.0') {
    errors.push('Invalid or missing version (must be "1.0")');
  }

  if (!manifest.package || typeof manifest.package !== 'string') {
    errors.push('Missing or invalid package name');
  }

  if (!manifest.appVersion || typeof manifest.appVersion !== 'string') {
    errors.push('Missing or invalid appVersion');
  }

  if (!manifest.metadata || typeof manifest.metadata !== 'object') {
    errors.push('Missing or invalid metadata object');
  } else {
    if (!manifest.metadata.name || typeof manifest.metadata.name !== 'string') {
      errors.push('Missing or invalid metadata.name');
    }
    if (
      !manifest.metadata.description ||
      typeof manifest.metadata.description !== 'string'
    ) {
      errors.push('Missing or invalid metadata.description');
    }
    // author is optional (may be omitted or empty string for edit/delete author)
    if (
      manifest.metadata.author !== undefined &&
      typeof manifest.metadata.author !== 'string'
    ) {
      errors.push('metadata.author must be a string when present');
    }
  }

  if (manifest.owners !== undefined) {
    if (!Array.isArray(manifest.owners)) {
      errors.push('owners must be an array when present');
    } else {
      const bad = manifest.owners.some(
        k => typeof k !== 'string' || k.trim() === ''
      );
      if (bad) errors.push('owners must be an array of non-empty strings');
    }
  }

  if (!manifest.wasm || typeof manifest.wasm !== 'object') {
    errors.push('Missing or invalid wasm object');
  } else {
    if (!manifest.wasm.path || typeof manifest.wasm.path !== 'string') {
      errors.push('Missing or invalid wasm.path');
    }
    if (!manifest.wasm.hash || typeof manifest.wasm.hash !== 'string') {
      errors.push('Missing or invalid wasm.hash');
    }
    if (typeof manifest.wasm.size !== 'number' || manifest.wasm.size <= 0) {
      errors.push('Missing or invalid wasm.size');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  sortKeysRecursively,
  canonicalizeJSON,
  canonicalizeBundle,
  validateBundleManifest,
};
