/**
 * V1 Configuration System
 *
 * Manages environment flags and configuration for the V1 API,
 * including security settings, validation options, and feature flags.
 */

class V1Config {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // Security and validation flags
    this.VERIFY_FETCH = this.getBooleanEnv('VERIFY_FETCH', false);
    this.ALLOW_UNVERIFIED = this.getBooleanEnv('ALLOW_UNVERIFIED', false);
    this.REQUIRE_SIGNATURES = this.getBooleanEnv('REQUIRE_SIGNATURES', false);
    this.ENABLE_RATE_LIMITING = this.getBooleanEnv('ENABLE_RATE_LIMITING', true);
    this.ENABLE_SIZE_LIMITS = this.getBooleanEnv('ENABLE_SIZE_LIMITS', true);

    // Security limits (can be overridden by environment)
    this.MAX_MANIFEST_SIZE = this.getNumberEnv('MAX_MANIFEST_SIZE', 1024 * 1024); // 1MB
    this.MAX_DEPENDENCIES = this.getNumberEnv('MAX_DEPENDENCIES', 32);
    this.MAX_PROVIDES = this.getNumberEnv('MAX_PROVIDES', 16);
    this.MAX_REQUIRES = this.getNumberEnv('MAX_REQUIRES', 16);
    this.MAX_SEARCH_RESULTS = this.getNumberEnv('MAX_SEARCH_RESULTS', 100);
    this.MAX_RESOLVE_DEPTH = this.getNumberEnv('MAX_RESOLVE_DEPTH', 10);

    // Rate limiting
    this.RATE_LIMIT_WINDOW = this.getNumberEnv('RATE_LIMIT_WINDOW', 60 * 1000); // 1 minute
    this.RATE_LIMIT_MAX = this.getNumberEnv('RATE_LIMIT_MAX', 100); // 100 requests per minute

    // Artifact validation
    this.ARTIFACT_FETCH_TIMEOUT = this.getNumberEnv('ARTIFACT_FETCH_TIMEOUT', 30000); // 30 seconds
    this.ARTIFACT_MAX_SIZE = this.getNumberEnv('ARTIFACT_MAX_SIZE', 10 * 1024 * 1024); // 10MB

    // Development flags
    this.DEV_MODE = this.getBooleanEnv('DEV_MODE', false);
    this.DEBUG_LOGGING = this.getBooleanEnv('DEBUG_LOGGING', false);
    this.ALLOW_LOCAL_ARTIFACTS = this.getBooleanEnv('ALLOW_LOCAL_ARTIFACTS', false);

    // Feature flags
    this.ENABLE_CANONICAL_JCS = this.getBooleanEnv('ENABLE_CANONICAL_JCS', true);
    this.ENABLE_INTERFACE_RESOLUTION = this.getBooleanEnv('ENABLE_INTERFACE_RESOLUTION', true);
    this.ENABLE_CYCLE_DETECTION = this.getBooleanEnv('ENABLE_CYCLE_DETECTION', true);
  }

  getBooleanEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  getNumberEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getStringEnv(key, defaultValue) {
    return process.env[key] || defaultValue;
  }

  // Configuration validation
  validateConfig() {
    const errors = [];

    if (this.MAX_MANIFEST_SIZE <= 0) {
      errors.push('MAX_MANIFEST_SIZE must be positive');
    }

    if (this.MAX_DEPENDENCIES <= 0) {
      errors.push('MAX_DEPENDENCIES must be positive');
    }

    if (this.RATE_LIMIT_MAX <= 0) {
      errors.push('RATE_LIMIT_MAX must be positive');
    }

    if (this.RATE_LIMIT_WINDOW <= 0) {
      errors.push('RATE_LIMIT_WINDOW must be positive');
    }

    if (this.REQUIRE_SIGNATURES && this.ALLOW_UNVERIFIED) {
      errors.push('REQUIRE_SIGNATURES and ALLOW_UNVERIFIED cannot both be true');
    }

    return errors;
  }

  // Get configuration summary for debugging
  getConfigSummary() {
    return {
      security: {
        verifyFetch: this.VERIFY_FETCH,
        allowUnverified: this.ALLOW_UNVERIFIED,
        requireSignatures: this.REQUIRE_SIGNATURES,
        rateLimiting: this.ENABLE_RATE_LIMITING,
        sizeLimits: this.ENABLE_SIZE_LIMITS,
      },
      limits: {
        maxManifestSize: this.MAX_MANIFEST_SIZE,
        maxDependencies: this.MAX_DEPENDENCIES,
        maxProvides: this.MAX_PROVIDES,
        maxRequires: this.MAX_REQUIRES,
        maxSearchResults: this.MAX_SEARCH_RESULTS,
        maxResolveDepth: this.MAX_RESOLVE_DEPTH,
        rateLimitMax: this.RATE_LIMIT_MAX,
        rateLimitWindow: this.RATE_LIMIT_WINDOW,
      },
      features: {
        canonicalJCS: this.ENABLE_CANONICAL_JCS,
        interfaceResolution: this.ENABLE_INTERFACE_RESOLUTION,
        cycleDetection: this.ENABLE_CYCLE_DETECTION,
      },
      development: {
        devMode: this.DEV_MODE,
        debugLogging: this.DEBUG_LOGGING,
        allowLocalArtifacts: this.ALLOW_LOCAL_ARTIFACTS,
      },
    };
  }

  // Check if a feature is enabled
  isFeatureEnabled(feature) {
    const featureMap = {
      'verify-fetch': this.VERIFY_FETCH,
      'allow-unverified': this.ALLOW_UNVERIFIED,
      'require-signatures': this.REQUIRE_SIGNATURES,
      'rate-limiting': this.ENABLE_RATE_LIMITING,
      'size-limits': this.ENABLE_SIZE_LIMITS,
      'canonical-jcs': this.ENABLE_CANONICAL_JCS,
      'interface-resolution': this.ENABLE_INTERFACE_RESOLUTION,
      'cycle-detection': this.ENABLE_CYCLE_DETECTION,
    };

    return featureMap[feature] || false;
  }

  // Get security limits for use in routes
  getSecurityLimits() {
    return {
      MAX_MANIFEST_SIZE: this.MAX_MANIFEST_SIZE,
      MAX_DEPENDENCIES: this.MAX_DEPENDENCIES,
      MAX_PROVIDES: this.MAX_PROVIDES,
      MAX_REQUIRES: this.MAX_REQUIRES,
      MAX_SEARCH_RESULTS: this.MAX_SEARCH_RESULTS,
      MAX_RESOLVE_DEPTH: this.MAX_RESOLVE_DEPTH,
      RATE_LIMIT_WINDOW: this.RATE_LIMIT_WINDOW,
      RATE_LIMIT_MAX: this.RATE_LIMIT_MAX,
    };
  }
}

module.exports = { V1Config };
