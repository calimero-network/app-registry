const fastify = require('fastify');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const path = require('path');
const fs = require('fs');

// Import config
const config = require('./config');

async function buildServer() {
  const server = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: config.cors.origin,
    credentials: true,
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

  // Health endpoint
  server.get('/healthz', async (_request, _reply) => {
    return { status: 'ok' };
  });

  // Statistics endpoint
  server.get('/stats', async (_request, _reply) => {
    return {
      publishedBundles: 0,
      activeDevelopers: 0,
      totalDownloads: 0,
      message: 'V2 Bundle API - Statistics endpoint',
    };
  });

  // Simple in-memory store for E2E testing
  const appStore = new Map();
  const appVersions = new Map();

  // Seed with test app on startup for E2E testing
  const seedTestApp = () => {
    // Real WASM file hash (kv-store.wasm)
    const wasmHash =
      '587d96f54984f62b2b1d834f07f4f162a9ab8c9a9d17a7d51f9baffca1f0b343';
    const wasmUrl = `http://localhost:${process.env.PORT || 8080}/artifacts/kv_store.wasm`;

    const testApp = {
      manifest_version: '1.0',
      id: 'com.calimero.test-app',
      name: 'Test App',
      version: '1.0.0',
      chains: ['near:testnet', 'near:mainnet'],
      artifact: {
        type: 'wasm',
        target: 'node',
        digest: `sha256:${wasmHash}`,
        uri: wasmUrl,
      },
      metadata: {
        description:
          'A simple test application for E2E testing (uses kv-store WASM)',
        author: 'Calimero Team',
      },
    };
    const key = `${testApp.id}/${testApp.version}`;
    appStore.set(key, testApp);
    appVersions.set(testApp.id, [testApp.version]);
  };

  // Seed on startup
  seedTestApp();

  // POST /api/v1/apps - Submit app manifest
  server.post('/api/v1/apps', async (request, reply) => {
    const manifest = request.body;

    // Basic validation
    if (!manifest.id || !manifest.name || !manifest.version) {
      return reply.code(400).send({
        error: 'invalid_schema',
        message: 'Missing required fields: id, name, or version',
      });
    }

    const key = `${manifest.id}/${manifest.version}`;

    // Check if already exists
    if (appStore.has(key)) {
      return reply.code(409).send({
        error: 'already_exists',
        message: `App ${manifest.id} version ${manifest.version} already exists`,
      });
    }

    // Store the manifest
    appStore.set(key, manifest);

    // Track versions
    if (!appVersions.has(manifest.id)) {
      appVersions.set(manifest.id, []);
    }
    appVersions.get(manifest.id).push(manifest.version);

    return reply.code(201).send({
      id: manifest.id,
      version: manifest.version,
      message: 'App registered successfully',
    });
  });

  // GET /api/v1/apps - List all apps
  server.get('/api/v1/apps', async (_request, _reply) => {
    const apps = Array.from(appVersions.keys()).map(id => {
      const versions = appVersions.get(id);
      // Get the latest version manifest
      const latestVersion = versions[versions.length - 1];
      const key = `${id}/${latestVersion}`;
      const manifest = appStore.get(key);

      return {
        id,
        name: manifest?.name || id,
        latest_version: latestVersion,
        latest_cid: manifest?.artifact?.digest || '',
        developer_pubkey: manifest?.signature?.pubkey || '',
        alias: manifest?.name,
      };
    });

    return { apps };
  });

  // GET /api/v1/apps/:id - Get app versions
  server.get('/api/v1/apps/:id', async (request, reply) => {
    const { id } = request.params;
    const versions = appVersions.get(id);

    if (!versions) {
      return reply.code(404).send({
        error: 'not_found',
        message: `App ${id} not found`,
      });
    }

    // Return VersionInfo objects with cid from manifests
    const versionInfos = versions.map(version => {
      const key = `${id}/${version}`;
      const manifest = appStore.get(key);
      return {
        semver: version,
        cid: manifest?.artifact?.digest || '',
        yanked: false,
      };
    });

    return {
      id,
      versions: versionInfos,
    };
  });

  // GET /api/v1/apps/:id/:version - Get specific manifest
  server.get('/api/v1/apps/:id/:version', async (request, reply) => {
    const { id, version } = request.params;
    const key = `${id}/${version}`;
    const manifest = appStore.get(key);

    if (!manifest) {
      return reply.code(404).send({
        error: 'not_found',
        message: `App ${id} version ${version} not found`,
      });
    }

    return manifest;
  });

  // Serve WASM artifacts
  server.get('/artifacts/:filename', async (request, reply) => {
    const { filename } = request.params;
    const artifactsDir = path.join(__dirname, '../artifacts');
    const filePath = path.join(artifactsDir, filename);

    // Security: only allow files in artifacts directory
    if (!filePath.startsWith(artifactsDir)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        error: 'not_found',
        message: `Artifact ${filename} not found`,
      });
    }

    // Read and send the file
    try {
      const fileContent = fs.readFileSync(filePath);

      // Set appropriate headers for WASM files
      reply.header('Content-Type', 'application/wasm');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
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
