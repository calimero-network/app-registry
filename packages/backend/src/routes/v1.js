/**
 * V1 API Routes
 *
 * Implements the v1 API endpoints according to the specification.
 */

const { V1Storage } = require('../lib/v1-storage');
const { V1Utils } = require('../lib/v1-utils');
const { v1ManifestSchema } = require('../schemas/v1-manifest');
const { V1Config } = require('../config/v1-config');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const semver = require('semver');

// Rate limiting storage
const rateLimitStore = new Map();

class V1Routes {
  constructor() {
    this.storage = new V1Storage();
    this.config = new V1Config();
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.validateManifest = this.ajv.compile(v1ManifestSchema);

    // Validate configuration on startup
    const configErrors = this.config.validateConfig();
    if (configErrors.length > 0) {
      throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
    }
  }

  // Security middleware functions
  checkRateLimit(request, reply, next) {
    if (!this.config.ENABLE_RATE_LIMITING) {
      return next();
    }

    const clientId = request.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - this.config.RATE_LIMIT_WINDOW;

    // Clean old entries
    for (const [key, timestamp] of rateLimitStore.entries()) {
      if (timestamp < windowStart) {
        rateLimitStore.delete(key);
      }
    }

    // Count requests in current window
    const clientRequests = Array.from(rateLimitStore.entries()).filter(
      ([key, timestamp]) => key.startsWith(clientId) && timestamp > windowStart
    );

    if (clientRequests.length >= this.config.RATE_LIMIT_MAX) {
      return reply.status(429).send({
        error: 'rate_limit_exceeded',
        message: `Too many requests. Limit: ${this.config.RATE_LIMIT_MAX} per minute`,
        retry_after: Math.ceil(
          (clientRequests[0][1] + this.config.RATE_LIMIT_WINDOW - now) / 1000
        ),
      });
    }

    // Record this request
    rateLimitStore.set(`${clientId}-${now}`, now);
    next();
  }

  checkManifestSize(request, reply, next) {
    if (!this.config.ENABLE_SIZE_LIMITS) {
      return next();
    }

    const contentLength = request.headers['content-length'];
    if (
      contentLength &&
      parseInt(contentLength) > this.config.MAX_MANIFEST_SIZE
    ) {
      return reply.status(413).send({
        error: 'payload_too_large',
        message: `Manifest size exceeds limit of ${this.config.MAX_MANIFEST_SIZE} bytes`,
      });
    }
    next();
  }

  validateSecurityLimits(manifest) {
    if (!this.config.ENABLE_SIZE_LIMITS) {
      return [];
    }

    const errors = [];

    // Check dependencies limit
    if (
      manifest.dependencies &&
      manifest.dependencies.length > this.config.MAX_DEPENDENCIES
    ) {
      errors.push(
        `Too many dependencies. Maximum: ${this.config.MAX_DEPENDENCIES}`
      );
    }

    // Check provides limit
    if (
      manifest.provides &&
      manifest.provides.length > this.config.MAX_PROVIDES
    ) {
      errors.push(
        `Too many provides interfaces. Maximum: ${this.config.MAX_PROVIDES}`
      );
    }

    // Check requires limit
    if (
      manifest.requires &&
      manifest.requires.length > this.config.MAX_REQUIRES
    ) {
      errors.push(
        `Too many requires interfaces. Maximum: ${this.config.MAX_REQUIRES}`
      );
    }

    return errors;
  }

  calculateResolveDepth(rootManifest, availableManifests) {
    const visited = new Set();
    let maxDepth = 0;

    const calculateDepth = (manifest, currentDepth) => {
      if (visited.has(`${manifest.id}@${manifest.version}`)) {
        return currentDepth;
      }
      visited.add(`${manifest.id}@${manifest.version}`);
      maxDepth = Math.max(maxDepth, currentDepth);

      if (manifest.dependencies) {
        for (const dep of manifest.dependencies) {
          const depManifest = availableManifests.find(
            m => m.id === dep.id && semver.satisfies(m.version, dep.range)
          );
          if (depManifest) {
            calculateDepth(depManifest, currentDepth + 1);
          }
        }
      }
    };

    calculateDepth(rootManifest, 0);
    return maxDepth;
  }

  /**
   * Register all v1 routes
   */
  registerRoutes(fastify) {
    // POST /v1/apps - Submit manifest
    fastify.post('/v1/apps', async (request, reply) => {
      try {
        const manifest = request.body;

        // Validate schema
        const valid = this.validateManifest(manifest);
        if (!valid) {
          return reply.status(400).send({
            error: 'invalid_schema',
            details: this.validateManifest.errors.map(e => e.message),
          });
        }

        // Validate manifest structure
        const validation = V1Utils.validateManifest(manifest);
        if (!validation.valid) {
          return reply.status(400).send({
            error: 'invalid_schema',
            details: validation.errors,
          });
        }

        // Validate digest format
        if (!V1Utils.validateDigest(manifest.artifact.digest)) {
          return reply.status(400).send({
            error: 'invalid_digest',
            details: 'artifact.digest must be in format "sha256:<64hex>"',
          });
        }

        // Validate URI format
        if (!V1Utils.validateUri(manifest.artifact.uri)) {
          return reply.status(400).send({
            error: 'invalid_uri',
            details: 'artifact.uri must start with "https://" or "ipfs://"',
          });
        }

        // Validate security limits
        const securityErrors = this.validateSecurityLimits(manifest);
        if (securityErrors.length > 0) {
          return reply.status(400).send({
            error: 'security_limit_exceeded',
            details: securityErrors,
          });
        }

        // Verify signature if present
        if (manifest.signature) {
          const signatureResult = V1Utils.verifySignature(manifest);
          if (!signatureResult.valid) {
            return reply.status(400).send({
              error: 'invalid_signature',
              details: signatureResult.error,
            });
          }
        }

        // Check if manifest already exists
        if (this.storage.hasManifest(manifest.id, manifest.version)) {
          return reply.status(409).send({
            error: 'already_exists',
            details: `${manifest.id}@${manifest.version}`,
          });
        }

        // Store manifest
        const manifestData = this.storage.storeManifest(manifest);

        return reply.status(201).send({
          id: manifest.id,
          version: manifest.version,
          canonical_uri: `/v1/apps/${manifest.id}/${manifest.version}`,
        });
      } catch (error) {
        fastify.log.error('Error in POST /v1/apps:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /v1/apps/:id - Get app versions
    fastify.get('/v1/apps/:id', async (request, reply) => {
      try {
        const { id } = request.params;
        const versions = this.storage.getAppVersions(id);

        if (versions.length === 0) {
          return reply.status(404).send({
            error: 'not_found',
            details: `App ${id} not found`,
          });
        }

        return reply.send({
          id,
          versions,
        });
      } catch (error) {
        fastify.log.error('Error in GET /v1/apps/:id:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /v1/apps/:id/:version - Get specific manifest
    fastify.get('/v1/apps/:id/:version', async (request, reply) => {
      try {
        const { id, version } = request.params;
        const { canonical } = request.query;

        if (canonical === 'true') {
          const manifestWithCanonical = this.storage.getManifestWithCanonical(
            id,
            version
          );
          if (!manifestWithCanonical) {
            return reply.status(404).send({
              error: 'not_found',
              details: `Manifest ${id}@${version} not found`,
            });
          }
          return reply.send(manifestWithCanonical);
        }

        const manifest = this.storage.getManifest(id, version);
        if (!manifest) {
          return reply.status(404).send({
            error: 'not_found',
            details: `Manifest ${id}@${version} not found`,
          });
        }

        // Add warnings if any
        const response = { ...manifest };
        if (!response._warnings) {
          response._warnings = [];
        }

        return reply.send(response);
      } catch (error) {
        fastify.log.error('Error in GET /v1/apps/:id/:version:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /v1/search - Search manifests
    fastify.get('/v1/search', async (request, reply) => {
      try {
        const { q } = request.query;

        if (!q) {
          return reply.status(400).send({
            error: 'invalid_query',
            details: 'Query parameter "q" is required',
          });
        }

        const results = this.storage.searchManifests(q);

        // Limit results for security
        const limitedResults = results.slice(0, this.config.MAX_SEARCH_RESULTS);

        return reply.send(limitedResults);
      } catch (error) {
        fastify.log.error('Error in GET /v1/search:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /v1/config - Get configuration (development only)
    fastify.get('/v1/config', async (request, reply) => {
      if (!this.config.DEV_MODE) {
        return reply.status(404).send({
          error: 'not_found',
          message: 'Configuration endpoint only available in development mode',
        });
      }

      return reply.send({
        config: this.config.getConfigSummary(),
        features: {
          'verify-fetch': this.config.isFeatureEnabled('verify-fetch'),
          'allow-unverified': this.config.isFeatureEnabled('allow-unverified'),
          'require-signatures':
            this.config.isFeatureEnabled('require-signatures'),
          'rate-limiting': this.config.isFeatureEnabled('rate-limiting'),
          'size-limits': this.config.isFeatureEnabled('size-limits'),
          'canonical-jcs': this.config.isFeatureEnabled('canonical-jcs'),
          'interface-resolution': this.config.isFeatureEnabled(
            'interface-resolution'
          ),
          'cycle-detection': this.config.isFeatureEnabled('cycle-detection'),
        },
      });
    });

    // POST /v1/resolve - Resolve dependencies
    fastify.post('/v1/resolve', async (request, reply) => {
      try {
        // eslint-disable-next-line no-unused-vars
        const { root, installed: _installed = [] } = request.body;

        if (!root || !root.id || !root.version) {
          return reply.status(400).send({
            error: 'invalid_root',
            details: 'root must have id and version',
          });
        }

        // Get root manifest
        const rootManifest = this.storage.getManifest(root.id, root.version);
        if (!rootManifest) {
          return reply.status(404).send({
            error: 'not_found',
            details: `Root manifest ${root.id}@${root.version} not found`,
          });
        }

        // Get all available manifests
        const availableManifests = this.storage.getAllManifests();

        // Check for cycles
        if (V1Utils.detectCycles([rootManifest, ...availableManifests])) {
          return reply.status(422).send({
            error: 'dependency_conflict',
            details: 'Circular dependency detected',
          });
        }

        // Check resolve depth limit
        const resolveDepth = this.calculateResolveDepth(
          rootManifest,
          availableManifests
        );
        if (resolveDepth > this.config.MAX_RESOLVE_DEPTH) {
          return reply.status(422).send({
            error: 'resolve_depth_exceeded',
            details: `Dependency resolution depth exceeds limit of ${this.config.MAX_RESOLVE_DEPTH}`,
          });
        }

        try {
          // Resolve dependencies
          const plan = V1Utils.resolveDependencies(
            rootManifest,
            availableManifests
          );

          // Check interface requirements
          const allManifests = [
            rootManifest,
            ...plan
              .map(p =>
                availableManifests.find(
                  m => m.id === p.id && m.version === p.version
                )
              )
              .filter(Boolean),
          ];

          const { satisfies, missing } =
            V1Utils.checkInterfaceRequirements(allManifests);

          if (missing.length > 0) {
            return reply.status(422).send({
              error: 'missing_requirements',
              details: missing,
            });
          }

          return reply.send({
            plan,
            satisfies,
            missing,
          });
        } catch (resolveError) {
          return reply.status(422).send({
            error: 'dependency_conflict',
            details: resolveError.message,
          });
        }
      } catch (error) {
        fastify.log.error('Error in POST /v1/resolve:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /apps/:id - Get app versions (legacy endpoint for frontend)
    fastify.get('/apps/:id', async (request, reply) => {
      try {
        const { id } = request.params;
        const versions = this.storage.getAppVersions(id);

        if (versions.length === 0) {
          return reply.status(404).send({
            error: 'not_found',
            details: `App ${id} not found`,
          });
        }

        // Convert to frontend format (VersionInfo[])
        const frontendVersions = versions.map(version => ({
          semver: version,
          cid: `ipfs://${id}@${version}`, // Mock CID for development
          yanked: false,
        }));

        return reply.send(frontendVersions);
      } catch (error) {
        fastify.log.error('Error in GET /apps/:id:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /apps/:id/:version - Get app manifest (legacy endpoint for frontend)
    fastify.get('/apps/:id/:version', async (request, reply) => {
      try {
        const { id, version } = request.params;
        const manifest = this.storage.getManifest(id, version);

        if (!manifest) {
          return reply.status(404).send({
            error: 'not_found',
            details: `Manifest ${id}@${version} not found`,
          });
        }

        // Convert to frontend format (AppManifest)
        const frontendManifest = {
          manifest_version: manifest.manifest_version,
          app: {
            name: manifest.name,
            developer_pubkey: manifest.developer?.pubkey || 'dev-key-unknown',
            id: manifest.id,
            alias: manifest.id,
          },
          version: {
            semver: manifest.version,
          },
          supported_chains: manifest.chains || ['near:testnet'],
          permissions: [
            {
              cap: 'basic',
              bytes: 1024,
            },
          ],
          artifacts: [
            {
              type: manifest.artifact.type,
              target: manifest.artifact.target,
              cid: manifest.artifact.uri,
              size: 1024,
            },
          ],
          metadata: {
            provides: manifest.provides || [],
            requires: manifest.requires || [],
          },
          distribution: 'ipfs',
          signature: manifest.signature || {
            alg: 'ed25519',
            sig: 'dev-signature',
            signed_at: new Date().toISOString(),
          },
        };

        return reply.send(frontendManifest);
      } catch (error) {
        fastify.log.error('Error in GET /apps/:id/:version:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });

    // GET /apps - Paginated apps list (legacy endpoint for frontend)
    fastify.get('/apps', async (request, reply) => {
      try {
        const {
          page = 1,
          limit = 20,
          dev: developerFilter = '',
          name: nameFilter = '',
        } = request.query;

        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 100); // Max 100 items per page
        const offset = (pageNum - 1) * limitNum;

        // Get all manifests and convert to frontend format
        const allManifests = this.storage.getAllManifests();

        // Filter by developer and name if provided
        let filteredManifests = allManifests;

        if (developerFilter) {
          filteredManifests = filteredManifests.filter(
            manifest =>
              manifest.developer &&
              manifest.developer.pubkey === developerFilter
          );
        }

        if (nameFilter) {
          filteredManifests = filteredManifests.filter(
            manifest =>
              manifest.name.toLowerCase().includes(nameFilter.toLowerCase()) ||
              manifest.id.toLowerCase().includes(nameFilter.toLowerCase())
          );
        }

        // Sort by latest version first, then by name
        filteredManifests.sort((a, b) => {
          // Group by app ID and get latest version
          const aLatest = allManifests
            .filter(m => m.id === a.id)
            .sort((x, y) => semver.rcompare(x.version, y.version))[0];
          const bLatest = allManifests
            .filter(m => m.id === b.id)
            .sort((x, y) => semver.rcompare(x.version, y.version))[0];

          if (aLatest && bLatest) {
            return aLatest.name.localeCompare(bLatest.name);
          }
          return 0;
        });

        // Get unique apps (latest version of each)
        const uniqueApps = new Map();
        filteredManifests.forEach(manifest => {
          if (!uniqueApps.has(manifest.id)) {
            uniqueApps.set(manifest.id, manifest);
          } else {
            const existing = uniqueApps.get(manifest.id);
            if (semver.gt(manifest.version, existing.version)) {
              uniqueApps.set(manifest.id, manifest);
            }
          }
        });

        const apps = Array.from(uniqueApps.values());
        const total = apps.length;
        const paginatedApps = apps.slice(offset, offset + limitNum);

        // Convert to frontend format (AppSummary interface)
        const frontendApps = paginatedApps.map(manifest => ({
          id: manifest.id,
          name: manifest.name,
          alias: manifest.id, // Use ID as alias for now
          developer_pubkey: manifest.developer?.pubkey || 'dev-key-unknown',
          latest_version: manifest.version,
          developer: {
            display_name: manifest.developer?.name || 'Unknown Developer',
            pubkey: manifest.developer?.pubkey || 'dev-key-unknown',
          },
        }));

        // Return apps array directly (frontend expects AppSummary[])
        return reply.send(frontendApps);
      } catch (error) {
        fastify.log.error('Error in GET /apps:', error);
        return reply.status(500).send({
          error: 'internal_error',
          details: 'Internal server error',
        });
      }
    });
  }
}

module.exports = { V1Routes };
