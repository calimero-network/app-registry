/**
 * Performance Monitoring System
 *
 * Monitors and tracks performance metrics for the V1 API,
 * including response times, cache hit rates, and resource usage.
 */

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        byStatus: new Map(),
      },
      responseTimes: {
        total: 0,
        average: 0,
        min: Infinity,
        max: 0,
        percentiles: {
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0,
        },
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
      },
      errors: {
        total: 0,
        byType: new Map(),
        byEndpoint: new Map(),
      },
      resources: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        cpu: {
          usage: 0,
        },
      },
    };

    this.responseTimeHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.alertThresholds = options.alertThresholds || {
      responseTime: 5000, // 5 seconds
      errorRate: 0.1, // 10%
      memoryUsage: 0.9, // 90%
    };

    this.alerts = [];
    this.startTime = Date.now();
  }

  /**
   * Record a request
   */
  recordRequest(method, endpoint, statusCode, responseTime) {
    if (!this.enabled) return;

    this.metrics.requests.total++;

    // Record by endpoint
    if (!this.metrics.requests.byEndpoint.has(endpoint)) {
      this.metrics.requests.byEndpoint.set(endpoint, 0);
    }
    this.metrics.requests.byEndpoint.set(
      endpoint,
      this.metrics.requests.byEndpoint.get(endpoint) + 1
    );

    // Record by method
    if (!this.metrics.requests.byMethod.has(method)) {
      this.metrics.requests.byMethod.set(method, 0);
    }
    this.metrics.requests.byMethod.set(
      method,
      this.metrics.requests.byMethod.get(method) + 1
    );

    // Record by status
    if (!this.metrics.requests.byStatus.has(statusCode)) {
      this.metrics.requests.byStatus.set(statusCode, 0);
    }
    this.metrics.requests.byStatus.set(
      statusCode,
      this.metrics.requests.byStatus.get(statusCode) + 1
    );

    // Record response time
    this.recordResponseTime(responseTime);

    // Record error if applicable
    if (statusCode >= 400) {
      this.recordError(statusCode, endpoint);
    }

    // Check for alerts
    this.checkAlerts();
  }

  /**
   * Record response time
   */
  recordResponseTime(responseTime) {
    this.responseTimeHistory.push(responseTime);

    // Keep history size manageable
    if (this.responseTimeHistory.length > this.maxHistorySize) {
      this.responseTimeHistory.shift();
    }

    // Update metrics
    this.metrics.responseTimes.total += responseTime;
    this.metrics.responseTimes.average =
      this.metrics.responseTimes.total / this.metrics.requests.total;
    this.metrics.responseTimes.min = Math.min(
      this.metrics.responseTimes.min,
      responseTime
    );
    this.metrics.responseTimes.max = Math.max(
      this.metrics.responseTimes.max,
      responseTime
    );

    // Calculate percentiles
    this.calculatePercentiles();
  }

  /**
   * Calculate response time percentiles
   */
  calculatePercentiles() {
    if (this.responseTimeHistory.length === 0) return;

    const sorted = [...this.responseTimeHistory].sort((a, b) => a - b);
    // const len = sorted.length;

    this.metrics.responseTimes.percentiles.p50 = this.getPercentile(
      sorted,
      0.5
    );
    this.metrics.responseTimes.percentiles.p90 = this.getPercentile(
      sorted,
      0.9
    );
    this.metrics.responseTimes.percentiles.p95 = this.getPercentile(
      sorted,
      0.95
    );
    this.metrics.responseTimes.percentiles.p99 = this.getPercentile(
      sorted,
      0.99
    );
  }

  /**
   * Get percentile value
   */
  getPercentile(sorted, percentile) {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit() {
    this.metrics.cache.hits++;
    this.updateCacheHitRate();
  }

  recordCacheMiss() {
    this.metrics.cache.misses++;
    this.updateCacheHitRate();
  }

  /**
   * Update cache hit rate
   */
  updateCacheHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate =
      total > 0 ? this.metrics.cache.hits / total : 0;
  }

  /**
   * Record an error
   */
  recordError(statusCode, endpoint) {
    this.metrics.errors.total++;

    // Record by type
    const errorType = this.getErrorType(statusCode);
    if (!this.metrics.errors.byType.has(errorType)) {
      this.metrics.errors.byType.set(errorType, 0);
    }
    this.metrics.errors.byType.set(
      errorType,
      this.metrics.errors.byType.get(errorType) + 1
    );

    // Record by endpoint
    if (!this.metrics.errors.byEndpoint.has(endpoint)) {
      this.metrics.errors.byEndpoint.set(endpoint, 0);
    }
    this.metrics.errors.byEndpoint.set(
      endpoint,
      this.metrics.errors.byEndpoint.get(endpoint) + 1
    );
  }

  /**
   * Get error type from status code
   */
  getErrorType(statusCode) {
    if (statusCode >= 500) return 'server_error';
    if (statusCode >= 400) return 'client_error';
    return 'unknown';
  }

  /**
   * Update resource usage
   */
  updateResourceUsage() {
    if (!this.enabled) return;

    const memUsage = process.memoryUsage();
    this.metrics.resources.memory.used = memUsage.heapUsed;
    this.metrics.resources.memory.total = memUsage.heapTotal;
    this.metrics.resources.memory.percentage =
      memUsage.heapUsed / memUsage.heapTotal;
  }

  /**
   * Check for performance alerts
   */
  checkAlerts() {
    const alerts = [];

    // Check response time
    if (
      this.metrics.responseTimes.average > this.alertThresholds.responseTime
    ) {
      alerts.push({
        type: 'high_response_time',
        message: `Average response time ${this.metrics.responseTimes.average}ms exceeds threshold ${this.alertThresholds.responseTime}ms`,
        severity: 'warning',
        timestamp: new Date().toISOString(),
      });
    }

    // Check error rate
    const errorRate = this.metrics.errors.total / this.metrics.requests.total;
    if (errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'high_error_rate',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.alertThresholds.errorRate * 100).toFixed(2)}%`,
        severity: 'error',
        timestamp: new Date().toISOString(),
      });
    }

    // Check memory usage
    if (
      this.metrics.resources.memory.percentage >
      this.alertThresholds.memoryUsage
    ) {
      alerts.push({
        type: 'high_memory_usage',
        message: `Memory usage ${(this.metrics.resources.memory.percentage * 100).toFixed(2)}% exceeds threshold ${(this.alertThresholds.memoryUsage * 100).toFixed(2)}%`,
        severity: 'warning',
        timestamp: new Date().toISOString(),
      });
    }

    this.alerts.push(...alerts);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    this.updateResourceUsage();

    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      alerts: this.alerts.slice(-10), // Last 10 alerts
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();

    return {
      status: this.getOverallStatus(),
      performance: {
        averageResponseTime: Math.round(metrics.responseTimes.average),
        p95ResponseTime: Math.round(metrics.responseTimes.percentiles.p95),
        requestsPerSecond: this.calculateRequestsPerSecond(),
        cacheHitRate: Math.round(metrics.cache.hitRate * 100),
        errorRate: Math.round(
          (metrics.errors.total / metrics.requests.total) * 100
        ),
      },
      resources: {
        memoryUsage: Math.round(metrics.resources.memory.percentage * 100),
        uptime: Math.round(metrics.uptime / 1000),
      },
      alerts: metrics.alerts.length,
    };
  }

  /**
   * Get overall status
   */
  getOverallStatus() {
    const errorRate = this.metrics.errors.total / this.metrics.requests.total;
    const avgResponseTime = this.metrics.responseTimes.average;
    const memoryUsage = this.metrics.resources.memory.percentage;

    if (errorRate > 0.1 || avgResponseTime > 5000 || memoryUsage > 0.9) {
      return 'degraded';
    } else if (
      errorRate > 0.05 ||
      avgResponseTime > 2000 ||
      memoryUsage > 0.8
    ) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Calculate requests per second
   */
  calculateRequestsPerSecond() {
    const uptime = (Date.now() - this.startTime) / 1000;
    return uptime > 0 ? Math.round(this.metrics.requests.total / uptime) : 0;
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        byStatus: new Map(),
      },
      responseTimes: {
        total: 0,
        average: 0,
        min: Infinity,
        max: 0,
        percentiles: {
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0,
        },
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
      },
      errors: {
        total: 0,
        byType: new Map(),
        byEndpoint: new Map(),
      },
      resources: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        cpu: {
          usage: 0,
        },
      },
    };

    this.responseTimeHistory = [];
    this.alerts = [];
    this.startTime = Date.now();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set alert thresholds
   */
  setAlertThresholds(thresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }
}

module.exports = { PerformanceMonitor };
