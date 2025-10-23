const fastify = require('fastify');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const path = require('path');
const fs = require('fs');

// Import V1 routes
const { V1Routes } = require('./routes/v1');

// V1 API - No global data store needed

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
    // V1 statistics - simplified for now
    return {
      publishedApps: 0,
      activeDevelopers: 0,
      totalDownloads: 0,
      message: 'V1 API - Statistics endpoint coming soon',
    };
  });

  // Register V1 routes only
  const v1Routes = new V1Routes();
  v1Routes.registerRoutes(server);

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
