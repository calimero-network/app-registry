const fastify = require('fastify');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const path = require('path');
const fs = require('fs');

// Import routes
const appsRoutes = require('./routes/apps');
const developersRoutes = require('./routes/developers');
const attestationsRoutes = require('./routes/attestations');

// Global data store for sharing between routes
global.developersStore = new Map();

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
    // Get apps data from the apps route
    const apps = require('./routes/apps');
    const appsData = apps.getAppsData ? apps.getAppsData() : [];

    // Calculate statistics
    const publishedApps = appsData.length;
    const activeDevelopers = new Set(appsData.map(app => app.developer_pubkey))
      .size;
    const totalDownloads = appsData.reduce(
      (sum, app) => sum + (app.downloads || 0),
      0
    );

    return {
      publishedApps,
      activeDevelopers,
      totalDownloads,
    };
  });

  // Register routes
  await server.register(appsRoutes, { prefix: '/apps' });
  await server.register(developersRoutes, { prefix: '/developers' });
  await server.register(attestationsRoutes, { prefix: '/attestations' });

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
