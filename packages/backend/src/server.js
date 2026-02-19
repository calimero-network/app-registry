const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fastify = require('fastify');
const cookie = require('@fastify/cookie');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const fs = require('fs');
const os = require('os');
const tar = require('tar');

// Import config
const config = require('./config');
const { BundleStorageKV } = require('./lib/bundle-storage-kv');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  normalizeSignature,
} = require('./lib/verify');
const { verifySessionToken } = require('./lib/auth');

async function buildServer() {
  const server = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register cookie (required for auth session and OAuth state)
  await server.register(cookie);

  // Register CORS
  await server.register(cors, {
    origin: [
      ...(config.cors?.origin || []),
      'http://localhost:1420', // Desktop app dev
      'http://localhost:3000', // Alternative dev port
      'http://localhost:8080', // Registry dev server
      'tauri://localhost', // Tauri apps
      'https://tauri.localhost', // Tauri apps
      'http://localhost:5173', // Vite dev server
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await server.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max for .mpk
  });

  // Register Swagger
  const yaml = require('js-yaml');
  const openapiSpec = yaml.load(
    fs.readFileSync(path.join(__dirname, '../api.yml'), 'utf8')
  );
  await server.register(swagger, {
    openapi: openapiSpec,
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Auth routes (Google OAuth, session cookie, /api/auth/me, /api/auth/logout)
  await server.register(require('./routes/auth-routes'), { config });

  // Health endpoint
  const healthHandler = async (_request, _reply) => {
    return { status: 'ok' };
  };
  server.get('/healthz', healthHandler);
  server.get('/api/healthz', healthHandler);

  // Statistics endpoint (optimized to avoid N+1 queries)
  const statsHandler = async (_request, _reply) => {
    try {
      // Get all bundle keys efficiently (parallel queries)
      const bundleKeys = await bundleStorage.getAllBundleKeys();

      // Count total bundles (all versions)
      const totalBundles = bundleKeys.length;

      // Batch fetch all manifests in parallel
      const bundles = await bundleStorage.getBundleManifestsBatch(bundleKeys);

      // Count unique developers (from metadata.author, falling back to signature.pubkey)
      const developers = new Set();
      for (const bundle of bundles) {
        const author = bundle?.metadata?.author || bundle?.signature?.pubkey;
        if (author) {
          developers.add(author);
        }
      }

      // Count unique packages
      const uniquePackages = new Set(
        bundleKeys.map(bundleKey => bundleKey.package)
      ).size;

      return {
        publishedBundles: totalBundles,
        uniquePackages,
        publishedApps: uniquePackages,
        activeDevelopers: developers.size,
        totalDownloads: 0, // TODO: Implement download tracking
      };
    } catch (error) {
      server.log.error('Error in GET /stats:', error);
      return {
        publishedBundles: 0,
        uniquePackages: 0,
        publishedApps: 0,
        activeDevelopers: 0,
        totalDownloads: 0,
        error: 'Failed to calculate statistics',
      };
    }
  };
  server.get('/stats', statsHandler);
  server.get('/api/stats', statsHandler);

  // Use BundleStorageKV for v2 bundle storage
  const bundleStorage = new BundleStorageKV();

  // Seed with test apps on startup for E2E testing
  const seedTestApps = async () => {
    // Real WASM file hash (kv-store.wasm)
    const wasmHash =
      '587d96f54984f62b2b1d834f07f4f162a9ab8c9a9d17a7d51f9baffca1f0b343';
    const wasmUrl = `http://localhost:${process.env.PORT || 8080}/artifacts/kv_store.wasm`;
    // Get WASM file size (approximate - kv_store.wasm is ~283KB)
    const wasmSize = 283441;

    // V2 Bundle format - Test App
    const testAppBundle = {
      version: '1.0', // Internal manifest version
      package: 'com.calimero.test-app',
      appVersion: '1.0.0',
      metadata: {
        name: 'Test App',
        description:
          'A simple test application for E2E testing (uses kv-store WASM)',
        author: 'Calimero Team',
      },
      interfaces: {
        exports: [],
        uses: [],
      },
      wasm: {
        path: wasmUrl,
        size: wasmSize,
        hash: wasmHash,
      },
      abi: null,
      migrations: [],
      links: null,
      signature: {
        alg: 'ed25519',
        sig: 'test-signature',
        pubkey:
          'ed25519:1111111111111111111111111111111111111111111111111111111111111111',
        signedAt: new Date().toISOString(),
      },
    };

    // V2 Bundle format - Frontend Demo App
    const frontendDemoBundle = {
      version: '1.0',
      package: 'com.calimero.frontend-demo',
      appVersion: '1.0.0',
      metadata: {
        name: 'Frontend Demo App',
        description:
          'A test application with a frontend link for testing frontend launch functionality',
        author: 'Calimero Team',
      },
      interfaces: {
        exports: [],
        uses: [],
      },
      wasm: {
        path: wasmUrl,
        size: wasmSize,
        hash: wasmHash,
      },
      abi: null,
      migrations: [],
      links: {
        frontend: 'https://www.calimero.network/',
        github: 'https://github.com/calimero-network',
        docs: 'https://docs.calimero.network',
      },
      signature: {
        alg: 'ed25519',
        sig: 'test-signature-2',
        pubkey:
          'ed25519:2222222222222222222222222222222222222222222222222222222222222222',
        signedAt: new Date().toISOString(),
      },
    };

    // Store bundles (only if they don't exist)
    try {
      await bundleStorage.storeBundleManifest(testAppBundle);
      server.log.info('✅ Seeded test-app bundle');
    } catch (err) {
      if (err.message.includes('already exists')) {
        server.log.info('ℹ️  test-app bundle already exists');
      } else {
        server.log.warn('⚠️  Failed to seed test-app bundle:', err.message);
      }
    }

    try {
      await bundleStorage.storeBundleManifest(frontendDemoBundle);
      server.log.info('✅ Seeded frontend-demo bundle');
    } catch (err) {
      if (err.message.includes('already exists')) {
        server.log.info('ℹ️  frontend-demo bundle already exists');
      } else {
        server.log.warn(
          '⚠️  Failed to seed frontend-demo bundle:',
          err.message
        );
      }
    }
  };

  // Seed test apps only in development mode
  // In production, bundles should be pushed via the API
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.SEED_TEST_APPS !== 'false'
  ) {
    await seedTestApps();
  } else {
    server.log.info(
      'ℹ️  Skipping test app seeding (production mode or SEED_TEST_APPS=false)'
    );
  }

  // Ensure every bundle response includes minRuntimeVersion (default for legacy bundles)
  const normalizeBundle = bundle => {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const raw =
      bundle.min_runtime_version ?? bundle.minRuntimeVersion ?? '0.1.0';
    const minRuntimeVersion =
      raw != null && String(raw).trim() ? String(raw).trim() : '0.1.0';
    return {
      ...bundle,
      min_runtime_version: minRuntimeVersion,
      minRuntimeVersion,
    };
  };

  // V2 Bundle API endpoints

  // Handle OPTIONS requests for CORS preflight
  server.options('/api/v2/bundles', async (request, reply) => {
    return reply.code(200).send();
  });

  server.options(
    '/api/v2/bundles/:package/:version',
    async (request, reply) => {
      return reply.code(200).send();
    }
  );

  // GET /api/v2/bundles - List all bundles
  server.get('/api/v2/bundles', async (request, reply) => {
    try {
      const { package: pkg, version, developer, author } = request.query || {};

      // If specific package and version requested, return single bundle
      if (pkg && version) {
        const bundle = await bundleStorage.getBundleManifest(pkg, version);
        if (!bundle) {
          return reply.code(404).send({
            error: 'bundle_not_found',
            message: `Bundle ${pkg}@${version} not found`,
          });
        }
        return [normalizeBundle(bundle)];
      }

      // Get all bundle packages
      const allPackages = await bundleStorage.getAllBundles();

      // Fetch all bundles with their latest versions
      const bundles = [];
      for (const packageName of allPackages) {
        // Filter by package if specified
        if (pkg && packageName !== pkg) {
          continue;
        }

        const versions = await bundleStorage.getBundleVersions(packageName);
        if (versions.length === 0) {
          continue;
        }

        // Get latest version (first in sorted descending list)
        const latestVersion = versions[0];
        const bundle = await bundleStorage.getBundleManifest(
          packageName,
          latestVersion
        );

        if (!bundle) {
          continue;
        }

        // Filter by developer pubkey if specified
        if (developer) {
          const bundlePubkey = bundle.signature?.pubkey;
          if (!bundlePubkey || bundlePubkey !== developer) {
            continue;
          }
        }

        // Filter by metadata.author (e.g. for "My packages" by email)
        if (author) {
          const bundleAuthor = bundle.metadata?.author;
          if (!bundleAuthor || bundleAuthor !== author) {
            continue;
          }
        }

        bundles.push(normalizeBundle(bundle));
      }

      // Sort by package name
      bundles.sort((a, b) => a.package.localeCompare(b.package));

      return bundles;
    } catch (error) {
      server.log.error('Error listing bundles:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to list bundles',
      });
    }
  });

  // GET /api/v2/bundles/:package/:version - Get specific bundle
  server.get('/api/v2/bundles/:package/:version', async (request, reply) => {
    try {
      const { package: pkg, version } = request.params;

      if (!pkg || !version) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Package and version are required',
        });
      }

      const bundle = await bundleStorage.getBundleManifest(pkg, version);

      if (!bundle) {
        return reply.code(404).send({
          error: 'bundle_not_found',
          message: `Bundle ${pkg}@${version} not found`,
        });
      }

      return normalizeBundle(bundle);
    } catch (error) {
      server.log.error('Error getting bundle:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to get bundle',
      });
    }
  });

  // Shared: validate manifest, verify signature, check ownership, store. Returns { package, appVersion } or throws { statusCode, body }.
  async function processPushBody(bundleManifest, { userEmail } = {}) {
    if (
      !bundleManifest ||
      bundleManifest === null ||
      bundleManifest === undefined
    ) {
      throw { statusCode: 400, body: { error: 'invalid_manifest', message: 'Missing body' } };
    }
    if (!bundleManifest.package || !bundleManifest.appVersion) {
      throw {
        statusCode: 400,
        body: {
          error: 'invalid_manifest',
          message: 'Missing required fields: package, appVersion',
        },
      };
    }
    const sig = normalizeSignature(bundleManifest?.signature);
    if (!sig) {
      throw {
        statusCode: 400,
        body: {
          error: 'missing_signature',
          message:
            'Missing signature. All publishes require a valid signature (algorithm, publicKey, signature).',
        },
      };
    }
    server.log.info('[push-file] Verifying manifest signature');
    try {
      await verifyManifest(bundleManifest);
      server.log.info('[push-file] Signature valid');
    } catch (error) {
      server.log.warn({ err: error }, '[push-file] Signature invalid: %s', error?.message ?? error);
      throw {
        statusCode: 400,
        body: {
          error: 'invalid_signature',
          message: error.message || 'Signature verification failed',
        },
      };
    }
    // Apply user metadata AFTER signature verification so it doesn't affect the signed payload
    if (userEmail) {
      bundleManifest.metadata = bundleManifest.metadata || {};
      bundleManifest.metadata.author = userEmail;
    }
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await bundleStorage.getBundleVersions(bundleManifest.package);
    if (versions.length > 0) {
      const existingManifest = await bundleStorage.getBundleManifest(
        bundleManifest.package,
        versions[0]
      );
      const ownerKey = getPublicKeyFromManifest(existingManifest);
      if (ownerKey != null && ownerKey !== incomingKey) {
        throw {
          statusCode: 403,
          body: {
            error: 'not_owner',
            message:
              'Package name is already registered to a different key; you are not the owner.',
          },
        };
      }
    }
    const overwrite =
      process.env.ALLOW_BUNDLE_OVERWRITE === 'true' ||
      process.env.ALLOW_BUNDLE_OVERWRITE === '1';
    await bundleStorage.storeBundleManifest(bundleManifest, overwrite);
    return { package: bundleManifest.package, version: bundleManifest.appVersion };
  }

  // POST /api/v2/bundles/push - Push a new bundle (used by CLI)
  const pushBundleHandler = async (request, reply) => {
    try {
      const result = await processPushBody(request.body);
      return reply.code(201).send({
        message: 'Bundle published successfully',
        package: result.package,
        version: result.version,
      });
    } catch (err) {
      if (err && typeof err.statusCode === 'number' && err.body) {
        return reply.code(err.statusCode).send(err.body);
      }
      server.log.error('Error pushing bundle:', err);
      return reply.code(500).send({
        error: 'internal_error',
        message: err?.message ?? String(err),
      });
    }
  };

  server.post('/api/v2/bundles/push', pushBundleHandler);
  server.options('/api/v2/bundles/push', async (_req, reply) =>
    reply.code(200).send()
  );

  // POST /api/v2/bundles/push-file - Push a bundle from .mpk file (used by frontend)
  server.post('/api/v2/bundles/push-file', async (request, reply) => {
    server.log.info('[push-file] Request received');
    let tempDir;
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Missing file. Upload a .mpk file in field "bundle".',
        });
      }
      const buffer = await data.toBuffer();
      const filename = data.filename || '';
      if (!filename.toLowerCase().endsWith('.mpk')) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'File must be a .mpk bundle.',
        });
      }

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-push-'));
      const mpkPath = path.join(tempDir, 'bundle.mpk');
      fs.writeFileSync(mpkPath, buffer);

      await tar.x({
        file: mpkPath,
        gzip: true,
        cwd: tempDir,
        filter: (name) => path.basename(name) === 'manifest.json',
      });
      function findManifest(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isFile() && e.name === 'manifest.json') return full;
          if (e.isDirectory()) {
            const r = findManifest(full);
            if (r) return r;
          }
        }
        return null;
      }
      const manifestPath = findManifest(tempDir);
      if (!manifestPath) {
        return reply.code(400).send({
          error: 'invalid_bundle',
          message: 'Bundle must contain manifest.json.',
        });
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const body = {
        ...manifest,
        _binary: buffer.toString('hex'),
        _overwrite: true,
      };

      const cookieName = config.auth?.cookieName || 'app_registry_session';
      const sessionSecret = config.auth?.sessionSecret;
      const token = request.cookies?.[cookieName];
      const user = sessionSecret && token ? await verifySessionToken(token, sessionSecret) : null;

      const result = await processPushBody(body, { userEmail: user?.email });
      return reply.code(201).send({
        message: 'Bundle published successfully',
        package: result.package,
        version: result.version,
      });
    } catch (err) {
      if (err && typeof err.statusCode === 'number' && err.body) {
        return reply.code(err.statusCode).send(err.body);
      }
      server.log.error('Error push-file:', err);
      return reply.code(500).send({
        error: 'internal_error',
        message: err?.message ?? String(err),
      });
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true });
        } catch (e) {
          server.log.warn('Cleanup temp dir failed:', e);
        }
      }
    }
  });

  // Serve artifacts (WASM, MPK, etc.)
  // Supports both flat structure (/artifacts/:filename) and nested structure (/artifacts/:package/:version/:filename)
  server.get('/artifacts/*', async (request, reply) => {
    const artifactPath = request.params['*']; // Get the full path after /artifacts/
    const artifactsDir = path.join(__dirname, '../artifacts');
    const filePath = path.join(artifactsDir, artifactPath);

    // Security: only allow files in artifacts directory
    // Use path.sep to prevent path traversal to sibling directories (e.g., artifacts-private)
    const resolvedPath = path.resolve(filePath);
    const resolvedArtifactsDir = path.resolve(artifactsDir);
    const artifactsDirWithSep = resolvedArtifactsDir + path.sep;
    if (
      !resolvedPath.startsWith(artifactsDirWithSep) &&
      resolvedPath !== resolvedArtifactsDir
    ) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        error: 'not_found',
        message: `Artifact ${artifactPath} not found`,
      });
    }

    // Read and send the file
    try {
      const fileContent = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Set appropriate Content-Type based on file extension
      let contentType = 'application/octet-stream';
      if (ext === '.wasm') {
        contentType = 'application/wasm';
      } else if (ext === '.mpk') {
        contentType = 'application/zip'; // MPK files are ZIP archives
      }

      reply.header('Content-Type', contentType);
      reply.header(
        'Content-Disposition',
        `attachment; filename="${path.basename(filePath)}"`
      );
      reply.header('Content-Length', fileContent.length);

      return reply.send(fileContent);
    } catch (error) {
      return reply.code(500).send({
        error: 'internal_error',
        message: `Failed to read artifact: ${error.message}`,
      });
    }
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    const port = process.env.PORT || 8080;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    server.log.info(`Server listening on ${host}:${port}`);
    server.log.info(
      `API documentation available at http://${host}:${port}/docs`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
