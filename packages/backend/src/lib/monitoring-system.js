/**
 * Comprehensive Monitoring System
 *
 * Integrates performance monitoring, structured logging, and health checks
 * for the V1 API registry.
 */

const { PerformanceMonitor } = require('./performance-monitor');
const { StructuredLogger } = require('./structured-logger');

class MonitoringSystem {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.metricsInterval = options.metricsInterval || 60000; // 1 minute
    this.alertThresholds = options.alertThresholds || {};

    // Initialize components
    this.performanceMonitor = new PerformanceMonitor({
      enabled: this.enabled,
      alertThresholds: this.alertThresholds,
    });

    this.logger = new StructuredLogger({
      level: options.logLevel || 'info',
      environment: options.environment || 'development',
      service: 'calimero-registry',
      version: '1.0.0',
    });

    // Health status
    this.healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 0,
      version: '1.0.0',
      checks: {},
    };

    // Monitoring state
    this.isMonitoring = false;
    this.intervals = [];

    // Event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Start monitoring
   */
  start() {
    if (!this.enabled || this.isMonitoring) {
      return;
    }

    this.logger.logStartup({
      port: process.env.PORT || 8080,
      host: process.env.HOST || '0.0.0.0',
      environment: process.env.NODE_ENV || 'development',
      features: this.getEnabledFeatures(),
    });

    this.isMonitoring = true;

    // Start health checks
    this.startHealthChecks();

    // Start metrics collection
    this.startMetricsCollection();

    this.logger.info('Monitoring system started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    // Clear intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    this.isMonitoring = false;
    this.logger.logShutdown('monitoring_stop');
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    const healthCheck = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    this.intervals.push(healthCheck);
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    const metricsCollection = setInterval(() => {
      this.collectMetrics();
    }, this.metricsInterval);

    this.intervals.push(metricsCollection);
  }

  /**
   * Perform health check
   */
  performHealthCheck() {
    const checks = {
      memory: this.checkMemoryHealth(),
      performance: this.checkPerformanceHealth(),
      storage: this.checkStorageHealth(),
    };

    const allHealthy = Object.values(checks).every(check => check.healthy);

    this.healthStatus = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      checks,
    };

    if (!allHealthy) {
      this.logger.warn('Health check failed', { checks });
    }
  }

  /**
   * Check memory health
   */
  checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const memoryUsage = memUsage.heapUsed / memUsage.heapTotal;

    return {
      healthy: memoryUsage < 0.9,
      memoryUsage: Math.round(memoryUsage * 100),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
    };
  }

  /**
   * Check performance health
   */
  checkPerformanceHealth() {
    const metrics = this.performanceMonitor.getMetrics();
    const avgResponseTime = metrics.responseTimes.average;
    const errorRate = metrics.errors.total / metrics.requests.total;

    return {
      healthy: avgResponseTime < 5000 && errorRate < 0.1,
      averageResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100),
      requestsTotal: metrics.requests.total,
    };
  }

  /**
   * Check storage health
   */
  checkStorageHealth() {
    // This would check actual storage health in a real implementation
    return {
      healthy: true,
      message: 'Storage is healthy',
    };
  }

  /**
   * Collect metrics
   */
  collectMetrics() {
    const metrics = this.performanceMonitor.getMetrics();
    this.logger.logPerformanceMetrics(metrics);

    // Emit metrics event
    this.emitEvent('metrics', metrics);
  }

  /**
   * Record API request
   */
  recordRequest(req, res, responseTime) {
    this.performanceMonitor.recordRequest(
      req.method,
      req.url,
      res.statusCode,
      responseTime
    );

    this.logger.logRequest(req, res, responseTime);
  }

  /**
   * Record API error
   */
  recordError(error, req = null) {
    this.performanceMonitor.recordError(
      error.statusCode || 500,
      req ? req.url : 'unknown'
    );

    this.logger.logError(error, req);
  }

  /**
   * Record manifest operation
   */
  recordManifestOperation(operation, manifestId, version, data = {}) {
    this.logger.logManifestOperation(operation, manifestId, version, data);
  }

  /**
   * Record dependency resolution
   */
  recordDependencyResolution(rootId, rootVersion, plan, conflicts = []) {
    this.logger.logDependencyResolution(rootId, rootVersion, plan, conflicts);
  }

  /**
   * Record search operation
   */
  recordSearch(query, results, responseTime) {
    this.performanceMonitor.recordRequest(
      'GET',
      '/v1/search',
      200,
      responseTime
    );
    this.logger.logSearch(query, results, responseTime);
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(operation, key, hit = null) {
    if (hit) {
      this.performanceMonitor.recordCacheHit();
    } else {
      this.performanceMonitor.recordCacheMiss();
    }

    this.logger.logCacheOperation(operation, key, hit);
  }

  /**
   * Record security event
   */
  recordSecurityEvent(event, data = {}) {
    this.logger.logSecurityEvent(event, data);
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return this.healthStatus;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return this.performanceMonitor.getPerformanceSummary();
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus() {
    return {
      enabled: this.enabled,
      monitoring: this.isMonitoring,
      healthStatus: this.healthStatus.status,
      uptime: this.healthStatus.uptime,
      intervals: this.intervals.length,
    };
  }

  /**
   * Get enabled features
   */
  getEnabledFeatures() {
    return {
      performanceMonitoring: this.enabled,
      structuredLogging: true,
      healthChecks: this.isMonitoring,
      metricsCollection: this.isMonitoring,
    };
  }

  /**
   * Add event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove event handler
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  emitEvent(event, data) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error('Event handler error', {
            event,
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * Create child logger
   */
  createChildLogger(context) {
    return this.logger.child(context);
  }

  /**
   * Set log level
   */
  setLogLevel(level) {
    this.logger.setLevel(level);
  }

  /**
   * Get log level
   */
  getLogLevel() {
    return this.logger.getLevel();
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.performanceMonitor.clearMetrics();
    this.logger.info('Metrics cleared');
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      monitoring: this.getMonitoringStatus(),
      health: this.getHealthStatus(),
      performance: this.getPerformanceSummary(),
      features: this.getEnabledFeatures(),
    };
  }
}

module.exports = { MonitoringSystem };
