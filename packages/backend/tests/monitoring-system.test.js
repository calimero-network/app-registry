/**
 * Monitoring System Tests
 *
 * Tests the comprehensive monitoring system including performance monitoring,
 * structured logging, and health checks.
 */

const { MonitoringSystem } = require('../src/lib/monitoring-system');

describe('Monitoring System', () => {
  let monitoringSystem;

  beforeEach(() => {
    monitoringSystem = new MonitoringSystem({
      enabled: true,
      healthCheckInterval: 100,
      metricsInterval: 100,
      logLevel: 'debug',
    });
  });

  afterEach(() => {
    monitoringSystem.stop();
  });

  describe('Basic Functionality', () => {
    test('should start and stop monitoring', () => {
      expect(monitoringSystem.isMonitoring).toBe(false);

      monitoringSystem.start();
      expect(monitoringSystem.isMonitoring).toBe(true);

      monitoringSystem.stop();
      expect(monitoringSystem.isMonitoring).toBe(false);
    });

    test('should record API requests', () => {
      const mockReq = {
        method: 'GET',
        url: '/v1/apps',
        headers: {},
        remoteAddress: '127.0.0.1',
      };

      const mockRes = {
        statusCode: 200,
        getHeaders: () => ({}),
      };

      monitoringSystem.recordRequest(mockReq, mockRes, 100);

      const metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.byMethod.get('GET')).toBe(1);
      expect(metrics.requests.byStatus.get(200)).toBe(1);
    });

    test('should record API errors', () => {
      const error = new Error('Test error');
      error.statusCode = 500;

      monitoringSystem.recordError(error);

      const metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.byType.get('server_error')).toBe(1);
    });

    test('should record manifest operations', () => {
      monitoringSystem.recordManifestOperation(
        'store',
        'com.example.app',
        '1.0.0',
        { size: 1024 }
      );

      // This should not throw an error
      expect(true).toBe(true);
    });

    test('should record dependency resolution', () => {
      const plan = [
        { id: 'com.example.app', version: '1.0.0' },
        { id: 'com.example.dep', version: '1.0.0' },
      ];

      monitoringSystem.recordDependencyResolution(
        'com.example.app',
        '1.0.0',
        plan,
        []
      );

      // This should not throw an error
      expect(true).toBe(true);
    });

    test('should record search operations', () => {
      const results = [
        { id: 'com.example.app1', version: '1.0.0' },
        { id: 'com.example.app2', version: '1.0.0' },
      ];

      monitoringSystem.recordSearch('test', results, 50);

      const metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.requests.total).toBe(1);
    });

    test('should record cache operations', () => {
      monitoringSystem.recordCacheOperation('get', 'search:test', true);
      monitoringSystem.recordCacheOperation('get', 'search:test2', false);

      const metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.cache.hits).toBe(1);
      expect(metrics.cache.misses).toBe(1);
    });

    test('should record security events', () => {
      monitoringSystem.recordSecurityEvent('rate_limit_exceeded', {
        ip: '127.0.0.1',
        limit: 100,
      });

      // This should not throw an error
      expect(true).toBe(true);
    });
  });

  describe('Health Checks', () => {
    test('should perform health checks', done => {
      monitoringSystem.start();

      setTimeout(() => {
        const healthStatus = monitoringSystem.getHealthStatus();
        expect(healthStatus.status).toBeDefined();
        expect(healthStatus.checks).toBeDefined();
        expect(healthStatus.checks.memory).toBeDefined();
        expect(healthStatus.checks.performance).toBeDefined();
        expect(healthStatus.checks.storage).toBeDefined();
        done();
      }, 150);
    });

    test('should detect memory issues', () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = () => ({
        heapUsed: 900 * 1024 * 1024, // 900MB
        heapTotal: 1000 * 1024 * 1024, // 1GB
      });

      monitoringSystem.performHealthCheck();
      const healthStatus = monitoringSystem.getHealthStatus();

      expect(healthStatus.checks.memory.healthy).toBe(false);
      expect(healthStatus.checks.memory.memoryUsage).toBe(90);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    test('should detect performance issues', () => {
      const mockReq = {
        method: 'GET',
        url: '/v1/apps',
        headers: {},
        remoteAddress: '127.0.0.1',
      };

      const mockRes = {
        statusCode: 200,
        getHeaders: () => ({}),
      };

      // Simulate high response times and error rates
      for (let i = 0; i < 10; i++) {
        monitoringSystem.recordRequest(mockReq, mockRes, 6000);
      }

      const errorRes = {
        statusCode: 500,
        getHeaders: () => ({}),
      };

      for (let i = 0; i < 5; i++) {
        monitoringSystem.recordRequest(mockReq, errorRes, 100);
      }

      monitoringSystem.performHealthCheck();
      const healthStatus = monitoringSystem.getHealthStatus();

      expect(healthStatus.checks.performance.healthy).toBe(false);
      expect(
        healthStatus.checks.performance.averageResponseTime
      ).toBeGreaterThan(3000);
      expect(healthStatus.checks.performance.errorRate).toBeGreaterThan(10);
    });
  });

  describe('Event System', () => {
    test('should handle events', done => {
      let eventReceived = false;

      monitoringSystem.on('metrics', data => {
        eventReceived = true;
        expect(data).toBeDefined();
        done();
      });

      monitoringSystem.start();

      setTimeout(() => {
        if (!eventReceived) {
          done(new Error('Event not received'));
        }
      }, 150);
    });

    test('should remove event handlers', () => {
      const handler = jest.fn();

      monitoringSystem.on('test', handler);
      monitoringSystem.off('test', handler);

      monitoringSystem.emitEvent('test', { data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Child Loggers', () => {
    test('should create child logger with context', () => {
      const childLogger = monitoringSystem.createChildLogger({
        userId: 'test-user',
        sessionId: 'test-session',
      });

      expect(childLogger).toBeDefined();
      expect(childLogger.getContext()).toHaveProperty('userId', 'test-user');
      expect(childLogger.getContext()).toHaveProperty(
        'sessionId',
        'test-session'
      );
    });
  });

  describe('Configuration', () => {
    test('should set log level', () => {
      monitoringSystem.setLogLevel('error');
      expect(monitoringSystem.getLogLevel()).toBe('error');
    });

    test('should clear metrics', () => {
      // Record some metrics
      const mockReq = {
        method: 'GET',
        url: '/v1/apps',
        headers: {},
        remoteAddress: '127.0.0.1',
      };

      const mockRes = {
        statusCode: 200,
        getHeaders: () => ({}),
      };

      monitoringSystem.recordRequest(mockReq, mockRes, 100);

      let metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.requests.total).toBe(1);

      monitoringSystem.clearMetrics();

      metrics = monitoringSystem.getPerformanceMetrics();
      expect(metrics.requests.total).toBe(0);
    });
  });

  describe('Status and Monitoring', () => {
    test('should get monitoring status', () => {
      const status = monitoringSystem.getMonitoringStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('monitoring');
      expect(status).toHaveProperty('healthStatus');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('intervals');
    });

    test('should get comprehensive status', () => {
      const status = monitoringSystem.getStatus();

      expect(status).toHaveProperty('monitoring');
      expect(status).toHaveProperty('health');
      expect(status).toHaveProperty('performance');
      expect(status).toHaveProperty('features');
    });

    test('should get enabled features', () => {
      const features = monitoringSystem.getEnabledFeatures();

      expect(features).toHaveProperty('performanceMonitoring');
      expect(features).toHaveProperty('structuredLogging');
      expect(features).toHaveProperty('healthChecks');
      expect(features).toHaveProperty('metricsCollection');
    });
  });

  describe('Integration', () => {
    test('should handle full monitoring lifecycle', done => {
      // const healthCheckCount = 0;
      let metricsCount = 0;

      monitoringSystem.on('metrics', () => {
        metricsCount++;
      });

      monitoringSystem.start();

      // Record some activity
      const mockReq = {
        method: 'GET',
        url: '/v1/apps',
        headers: {},
        remoteAddress: '127.0.0.1',
      };

      const mockRes = {
        statusCode: 200,
        getHeaders: () => ({}),
      };

      monitoringSystem.recordRequest(mockReq, mockRes, 100);
      monitoringSystem.recordManifestOperation(
        'store',
        'com.example.app',
        '1.0.0'
      );
      monitoringSystem.recordSearch('test', [], 50);

      setTimeout(() => {
        expect(metricsCount).toBeGreaterThan(0);

        const status = monitoringSystem.getStatus();
        expect(status.monitoring.monitoring).toBe(true);
        expect(status.health.status).toBeDefined();
        expect(status.performance).toBeDefined();

        monitoringSystem.stop();
        expect(monitoringSystem.isMonitoring).toBe(false);

        done();
      }, 200);
    });
  });
});
