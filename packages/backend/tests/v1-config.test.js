/**
 * V1 Configuration Tests
 *
 * Tests the configuration system for environment flags,
 * validation, and feature toggles.
 */

const { V1Config } = require('../src/config/v1-config');

describe('V1 Configuration System', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    test('should load default values when no environment variables are set', () => {
      const config = new V1Config();

      expect(config.VERIFY_FETCH).toBe(false);
      expect(config.ALLOW_UNVERIFIED).toBe(false);
      expect(config.REQUIRE_SIGNATURES).toBe(false);
      expect(config.ENABLE_RATE_LIMITING).toBe(true);
      expect(config.ENABLE_SIZE_LIMITS).toBe(true);
      expect(config.DEV_MODE).toBe(false);
      expect(config.DEBUG_LOGGING).toBe(false);
    });

    test('should have reasonable default limits', () => {
      const config = new V1Config();

      expect(config.MAX_MANIFEST_SIZE).toBe(1024 * 1024); // 1MB
      expect(config.MAX_DEPENDENCIES).toBe(32);
      expect(config.MAX_PROVIDES).toBe(16);
      expect(config.MAX_REQUIRES).toBe(16);
      expect(config.MAX_SEARCH_RESULTS).toBe(100);
      expect(config.MAX_RESOLVE_DEPTH).toBe(10);
      expect(config.RATE_LIMIT_MAX).toBe(100);
      expect(config.RATE_LIMIT_WINDOW).toBe(60 * 1000); // 1 minute
    });
  });

  describe('Environment Variable Parsing', () => {
    test('should parse boolean environment variables correctly', () => {
      process.env.VERIFY_FETCH = 'true';
      process.env.ALLOW_UNVERIFIED = '1';
      process.env.REQUIRE_SIGNATURES = 'false';
      process.env.ENABLE_RATE_LIMITING = '0';

      const config = new V1Config();

      expect(config.VERIFY_FETCH).toBe(true);
      expect(config.ALLOW_UNVERIFIED).toBe(true);
      expect(config.REQUIRE_SIGNATURES).toBe(false);
      expect(config.ENABLE_RATE_LIMITING).toBe(false);
    });

    test('should parse numeric environment variables correctly', () => {
      process.env.MAX_MANIFEST_SIZE = '2048000';
      process.env.MAX_DEPENDENCIES = '64';
      process.env.RATE_LIMIT_MAX = '200';

      const config = new V1Config();

      expect(config.MAX_MANIFEST_SIZE).toBe(2048000);
      expect(config.MAX_DEPENDENCIES).toBe(64);
      expect(config.RATE_LIMIT_MAX).toBe(200);
    });

    test('should handle invalid numeric values gracefully', () => {
      process.env.MAX_MANIFEST_SIZE = 'invalid';
      process.env.MAX_DEPENDENCIES = 'not-a-number';

      const config = new V1Config();

      expect(config.MAX_MANIFEST_SIZE).toBe(1024 * 1024); // Default value
      expect(config.MAX_DEPENDENCIES).toBe(32); // Default value
    });
  });

  describe('Configuration Validation', () => {
    test('should validate positive limits', () => {
      process.env.MAX_MANIFEST_SIZE = '0';
      process.env.MAX_DEPENDENCIES = '-1';
      process.env.RATE_LIMIT_MAX = '0';

      const config = new V1Config();
      const errors = config.validateConfig();

      expect(errors).toContain('MAX_MANIFEST_SIZE must be positive');
      expect(errors).toContain('MAX_DEPENDENCIES must be positive');
      expect(errors).toContain('RATE_LIMIT_MAX must be positive');
    });

    test('should validate conflicting flags', () => {
      process.env.REQUIRE_SIGNATURES = 'true';
      process.env.ALLOW_UNVERIFIED = 'true';

      const config = new V1Config();
      const errors = config.validateConfig();

      expect(errors).toContain(
        'REQUIRE_SIGNATURES and ALLOW_UNVERIFIED cannot both be true'
      );
    });

    test('should pass validation with valid configuration', () => {
      process.env.MAX_MANIFEST_SIZE = '2048000';
      process.env.MAX_DEPENDENCIES = '64';
      process.env.RATE_LIMIT_MAX = '200';

      const config = new V1Config();
      const errors = config.validateConfig();

      expect(errors).toHaveLength(0);
    });
  });

  describe('Feature Flags', () => {
    test('should correctly identify enabled features', () => {
      process.env.ENABLE_RATE_LIMITING = 'true';
      process.env.ENABLE_SIZE_LIMITS = 'true';
      process.env.ENABLE_CANONICAL_JCS = 'true';

      const config = new V1Config();

      expect(config.isFeatureEnabled('rate-limiting')).toBe(true);
      expect(config.isFeatureEnabled('size-limits')).toBe(true);
      expect(config.isFeatureEnabled('canonical-jcs')).toBe(true);
      expect(config.isFeatureEnabled('verify-fetch')).toBe(false);
    });

    test('should return false for unknown features', () => {
      const config = new V1Config();

      expect(config.isFeatureEnabled('unknown-feature')).toBe(false);
    });
  });

  describe('Configuration Summary', () => {
    test('should provide comprehensive configuration summary', () => {
      process.env.DEV_MODE = 'true';
      process.env.DEBUG_LOGGING = 'true';
      process.env.MAX_MANIFEST_SIZE = '2048000';

      const config = new V1Config();
      const summary = config.getConfigSummary();

      expect(summary).toHaveProperty('security');
      expect(summary).toHaveProperty('limits');
      expect(summary).toHaveProperty('features');
      expect(summary).toHaveProperty('development');

      expect(summary.development.devMode).toBe(true);
      expect(summary.development.debugLogging).toBe(true);
      expect(summary.limits.maxManifestSize).toBe(2048000);
    });
  });

  describe('Security Limits', () => {
    test('should provide security limits object', () => {
      process.env.MAX_MANIFEST_SIZE = '2048000';
      process.env.MAX_DEPENDENCIES = '64';
      process.env.RATE_LIMIT_MAX = '200';

      const config = new V1Config();
      const limits = config.getSecurityLimits();

      expect(limits).toHaveProperty('MAX_MANIFEST_SIZE', 2048000);
      expect(limits).toHaveProperty('MAX_DEPENDENCIES', 64);
      expect(limits).toHaveProperty('RATE_LIMIT_MAX', 200);
      expect(limits).toHaveProperty('RATE_LIMIT_WINDOW');
      expect(limits).toHaveProperty('MAX_PROVIDES');
      expect(limits).toHaveProperty('MAX_REQUIRES');
      expect(limits).toHaveProperty('MAX_SEARCH_RESULTS');
      expect(limits).toHaveProperty('MAX_RESOLVE_DEPTH');
    });
  });

  describe('Development Mode', () => {
    test('should enable development features when DEV_MODE is true', () => {
      process.env.DEV_MODE = 'true';
      process.env.DEBUG_LOGGING = 'true';
      process.env.ALLOW_LOCAL_ARTIFACTS = 'true';

      const config = new V1Config();

      expect(config.DEV_MODE).toBe(true);
      expect(config.DEBUG_LOGGING).toBe(true);
      expect(config.ALLOW_LOCAL_ARTIFACTS).toBe(true);
    });

    test('should disable development features by default', () => {
      const config = new V1Config();

      expect(config.DEV_MODE).toBe(false);
      expect(config.DEBUG_LOGGING).toBe(false);
      expect(config.ALLOW_LOCAL_ARTIFACTS).toBe(false);
    });
  });
});
