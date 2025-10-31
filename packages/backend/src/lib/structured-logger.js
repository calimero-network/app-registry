/**
 * Structured Logging System
 *
 * Provides structured logging with different levels, contexts, and formatting
 * for the V1 API registry.
 */

const pino = require('pino');

class StructuredLogger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.environment = options.environment || 'development';
    this.service = options.service || 'calimero-registry';
    this.version = options.version || '1.0.0';

    // Create pino logger
    this.logger = pino({
      level: this.level,
      base: {
        service: this.service,
        version: this.version,
        environment: this.environment,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: label => ({ level: label }),
      },
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
      },
    });

    // Context storage
    this.context = new Map();
  }

  /**
   * Set context for all subsequent logs
   */
  setContext(key, value) {
    this.context.set(key, value);
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context.clear();
  }

  /**
   * Get current context
   */
  getContext() {
    return Object.fromEntries(this.context);
  }

  /**
   * Log with context
   */
  logWithContext(level, message, data = {}) {
    const contextData = this.getContext();
    const logData = { ...contextData, ...data };

    this.logger[level](logData, message);
  }

  /**
   * Debug logging
   */
  debug(message, data = {}) {
    this.logWithContext('debug', message, data);
  }

  /**
   * Info logging
   */
  info(message, data = {}) {
    this.logWithContext('info', message, data);
  }

  /**
   * Warn logging
   */
  warn(message, data = {}) {
    this.logWithContext('warn', message, data);
  }

  /**
   * Error logging
   */
  error(message, data = {}) {
    this.logWithContext('error', message, data);
  }

  /**
   * Fatal logging
   */
  fatal(message, data = {}) {
    this.logWithContext('fatal', message, data);
  }

  /**
   * Log API request
   */
  logRequest(req, res, responseTime) {
    this.setContext('requestId', req.id);
    this.setContext('method', req.method);
    this.setContext('url', req.url);
    this.setContext('statusCode', res.statusCode);
    this.setContext('responseTime', responseTime);

    this.info('API request completed', {
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
      },
      res: {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
      },
      responseTime,
    });
  }

  /**
   * Log API error
   */
  logError(error, req = null, additionalData = {}) {
    const errorData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...additionalData,
    };

    if (req) {
      errorData.req = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
      };
    }

    this.error('API error occurred', errorData);
  }

  /**
   * Log manifest operations
   */
  logManifestOperation(operation, manifestId, version, data = {}) {
    this.setContext('operation', operation);
    this.setContext('manifestId', manifestId);
    this.setContext('version', version);

    this.info(`Manifest ${operation}`, {
      operation,
      manifestId,
      version,
      ...data,
    });
  }

  /**
   * Log dependency resolution
   */
  logDependencyResolution(rootId, rootVersion, plan, conflicts = []) {
    this.setContext('rootId', rootId);
    this.setContext('rootVersion', rootVersion);

    this.info('Dependency resolution completed', {
      rootId,
      rootVersion,
      plan: plan.map(item => `${item.id}@${item.version}`),
      conflicts,
      planSize: plan.length,
    });
  }

  /**
   * Log search operations
   */
  logSearch(query, results, responseTime) {
    this.setContext('searchQuery', query);
    this.setContext('resultCount', results.length);
    this.setContext('searchTime', responseTime);

    this.info('Search operation completed', {
      query,
      resultCount: results.length,
      responseTime,
    });
  }

  /**
   * Log cache operations
   */
  logCacheOperation(operation, key, hit = null) {
    this.setContext('cacheOperation', operation);
    this.setContext('cacheKey', key);

    const data = { operation, key };
    if (hit !== null) {
      data.hit = hit;
    }

    this.debug(`Cache ${operation}`, data);
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(metrics) {
    this.info('Performance metrics', {
      metrics: {
        requests: metrics.requests,
        responseTimes: metrics.responseTimes,
        cache: metrics.cache,
        errors: metrics.errors,
        resources: metrics.resources,
      },
    });
  }

  /**
   * Log security events
   */
  logSecurityEvent(event, data = {}) {
    this.warn('Security event', {
      event,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log startup
   */
  logStartup(config) {
    this.info('Service starting', {
      config: {
        port: config.port,
        host: config.host,
        environment: config.environment,
        features: config.features,
      },
    });
  }

  /**
   * Log shutdown
   */
  logShutdown(reason = 'normal') {
    this.info('Service shutting down', { reason });
  }

  /**
   * Create child logger with additional context
   */
  child(context) {
    const childLogger = new StructuredLogger({
      level: this.level,
      environment: this.environment,
      service: this.service,
      version: this.version,
    });

    // Copy current context
    for (const [key, value] of this.context) {
      childLogger.setContext(key, value);
    }

    // Add new context
    for (const [key, value] of Object.entries(context)) {
      childLogger.setContext(key, value);
    }

    return childLogger;
  }

  /**
   * Get logger instance
   */
  getLogger() {
    return this.logger;
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.level = level;
    this.logger.level = level;
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.level;
  }
}

module.exports = { StructuredLogger };
