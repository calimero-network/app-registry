/**
 * V1 Performance Tests
 *
 * Tests performance optimizations for large dependency graphs and searches.
 */

const { V1StorageOptimized } = require('../src/lib/v1-storage-optimized');
const { PerformanceMonitor } = require('../src/lib/performance-monitor');

describe('V1 Performance Optimizations', () => {
  let storage;
  let monitor;

  beforeEach(() => {
    storage = new V1StorageOptimized({ cacheSize: 100 });
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    storage.reset();
    monitor.clearMetrics();
  });

  describe('Optimized Storage', () => {
    test('should handle large number of manifests efficiently', () => {
      const startTime = Date.now();

      // Create 1000 manifests
      for (let i = 0; i < 1000; i++) {
        const manifest = {
          manifest_version: '1.0',
          id: `com.example.app${i}`,
          name: `App ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/app${i}.wasm`,
          },
          provides: [`interface${i}@1`],
          requires: [`dependency${i}@1`],
        };

        storage.storeManifest(manifest);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);

      // Verify all manifests are stored
      expect(storage.manifests.size).toBe(1000);
    });

    test('should cache search results', () => {
      // Store some manifests
      for (let i = 0; i < 100; i++) {
        const manifest = {
          manifest_version: '1.0',
          id: `com.example.app${i}`,
          name: `App ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/app${i}.wasm`,
          },
        };

        storage.storeManifest(manifest);
      }

      // First search (cache miss)
      const start1 = Date.now();
      const results1 = storage.searchManifests('app1');
      const duration1 = Date.now() - start1;

      // Second search (cache hit)
      const start2 = Date.now();
      const results2 = storage.searchManifests('app1');
      const duration2 = Date.now() - start2;

      // Cache hit should be faster or equal (both might be very fast)
      expect(duration2).toBeLessThanOrEqual(duration1);
      expect(results1).toEqual(results2);

      // Verify cache metrics
      const metrics = storage.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
    });

    test('should handle complex dependency resolution efficiently', () => {
      // Create a complex dependency graph
      const manifests = [];

      // Root app
      manifests.push({
        manifest_version: '1.0',
        id: 'com.example.root',
        name: 'Root App',
        version: '1.0.0',
        chains: ['near:testnet'],
        artifact: {
          type: 'wasm',
          target: 'node',
          digest: `sha256:${'0'.repeat(64)}`,
          uri: 'https://example.com/root.wasm',
        },
        dependencies: [
          { id: 'com.example.dep1', range: '^1.0.0' },
          { id: 'com.example.dep2', range: '^1.0.0' },
        ],
      });

      // Dependencies
      for (let i = 1; i <= 10; i++) {
        manifests.push({
          manifest_version: '1.0',
          id: `com.example.dep${i}`,
          name: `Dependency ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/dep${i}.wasm`,
          },
          dependencies:
            i < 5 ? [{ id: `com.example.subdep${i}`, range: '^1.0.0' }] : [],
        });
      }

      // Sub-dependencies
      for (let i = 1; i <= 5; i++) {
        manifests.push({
          manifest_version: '1.0',
          id: `com.example.subdep${i}`,
          name: `Sub-dependency ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/subdep${i}.wasm`,
          },
        });
      }

      // Store all manifests
      for (const manifest of manifests) {
        storage.storeManifest(manifest);
      }

      // Test dependency resolution
      const startTime = Date.now();
      const resolution = storage.resolveDependencies(
        'com.example.root',
        '1.0.0'
      );
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);

      // Verify resolution plan
      expect(resolution.plan).toBeDefined();
      expect(resolution.plan.length).toBeGreaterThan(0);
    });

    test('should maintain search index efficiently', () => {
      // Store manifests with various search terms
      const searchTerms = ['chat', 'storage', 'database', 'api', 'auth'];

      for (let i = 0; i < 500; i++) {
        const term = searchTerms[i % searchTerms.length];
        const manifest = {
          manifest_version: '1.0',
          id: `com.example.${term}${i}`,
          name: `${term} App ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/${term}${i}.wasm`,
          },
          provides: [`${term}.interface@1`],
        };

        storage.storeManifest(manifest);
      }

      // Test search performance
      const startTime = Date.now();
      const results = storage.searchManifests('chat');
      const duration = Date.now() - startTime;

      // Should be fast due to indexing
      expect(duration).toBeLessThan(50);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring', () => {
    test('should track request metrics', () => {
      // Simulate requests
      for (let i = 0; i < 100; i++) {
        monitor.recordRequest('GET', '/v1/apps', 200, 50 + Math.random() * 100);
      }

      const metrics = monitor.getMetrics();

      expect(metrics.requests.total).toBe(100);
      expect(metrics.requests.byMethod.get('GET')).toBe(100);
      expect(metrics.requests.byStatus.get(200)).toBe(100);
      expect(metrics.responseTimes.average).toBeGreaterThan(50);
    });

    test('should track cache performance', () => {
      // Simulate cache hits and misses
      for (let i = 0; i < 50; i++) {
        monitor.recordCacheHit();
      }

      for (let i = 0; i < 50; i++) {
        monitor.recordCacheMiss();
      }

      const metrics = monitor.getMetrics();

      expect(metrics.cache.hits).toBe(50);
      expect(metrics.cache.misses).toBe(50);
      expect(metrics.cache.hitRate).toBe(0.5);
    });

    test('should track error rates', () => {
      // Simulate requests with errors
      for (let i = 0; i < 80; i++) {
        monitor.recordRequest('GET', '/v1/apps', 200, 50);
      }

      for (let i = 0; i < 20; i++) {
        monitor.recordRequest('GET', '/v1/apps', 404, 100);
      }

      const metrics = monitor.getMetrics();

      expect(metrics.requests.total).toBe(100);
      expect(metrics.errors.total).toBe(20);
      expect(metrics.errors.byType.get('client_error')).toBe(20);
    });

    test('should generate performance alerts', () => {
      // Set low thresholds for testing
      monitor.setAlertThresholds({
        responseTime: 100,
        errorRate: 0.1,
        memoryUsage: 0.8,
      });

      // Simulate high response times
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest('GET', '/v1/apps', 200, 200);
      }

      const metrics = monitor.getMetrics();

      expect(metrics.alerts.length).toBeGreaterThan(0);
      expect(metrics.alerts[0].type).toBe('high_response_time');
    });

    test('should calculate performance summary', () => {
      // Simulate various metrics
      for (let i = 0; i < 100; i++) {
        monitor.recordRequest('GET', '/v1/apps', 200, 100);
      }

      for (let i = 0; i < 10; i++) {
        monitor.recordRequest('GET', '/v1/apps', 404, 50);
      }

      const summary = monitor.getPerformanceSummary();

      expect(summary.status).toBeDefined();
      expect(summary.performance.averageResponseTime).toBeGreaterThan(0);
      expect(summary.performance.requestsPerSecond).toBeGreaterThanOrEqual(0);
      expect(summary.performance.errorRate).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Performance Integration', () => {
    test('should handle concurrent operations', async () => {
      const promises = [];

      // Simulate concurrent manifest storage
      for (let i = 0; i < 100; i++) {
        const manifest = {
          manifest_version: '1.0',
          id: `com.example.app${i}`,
          name: `App ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/app${i}.wasm`,
          },
        };

        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              storage.storeManifest(manifest);
              resolve();
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      // Verify all manifests were stored
      expect(storage.manifests.size).toBe(100);
    });

    test('should maintain performance under load', () => {
      const startTime = Date.now();

      // Simulate high load
      for (let i = 0; i < 1000; i++) {
        const manifest = {
          manifest_version: '1.0',
          id: `com.example.app${i}`,
          name: `App ${i}`,
          version: '1.0.0',
          chains: ['near:testnet'],
          artifact: {
            type: 'wasm',
            target: 'node',
            digest: `sha256:${'0'.repeat(64)}`,
            uri: `https://example.com/app${i}.wasm`,
          },
        };

        storage.storeManifest(manifest);

        // Simulate search every 10 manifests
        if (i % 10 === 0) {
          storage.searchManifests(`app${i}`);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(2000);

      // Verify final state
      expect(storage.manifests.size).toBe(1000);

      const metrics = storage.getMetrics();
      expect(metrics.totalManifests).toBe(1000);
    });
  });
});
