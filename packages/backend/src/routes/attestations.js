const { validatePublicKey, validateSemver } = require('../lib/verify');
const config = require('../config');

async function routes(fastify, _options) {
  // In-memory storage for demo (replace with database in production)
  const attestations = new Map();

  // GET /attestations/{app_id}/{semver} - Get registry attestations
  fastify.get(
    '/:app_id/:semver',
    {
      schema: {
        params: {
          type: 'object',
          required: ['app_id', 'semver'],
          properties: {
            app_id: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_-]+$',
            },
            semver: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['ok', 'yanked', 'tested'],
              },
              comment: { type: 'string' },
              timestamp: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { app_id, semver } = request.params;

      if (!validateSemver(semver)) {
        return reply.code(400).send({ error: 'Invalid semver format' });
      }

      const attestationKey = `${app_id}/${semver}`;
      const attestation = attestations.get(attestationKey);

      if (!attestation) {
        return reply.code(404).send({ error: 'Attestation not found' });
      }

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return attestation;
    }
  );

  // POST /attestations - Create attestation (not in OpenAPI spec but needed for demo)
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['pubkey', 'app_name', 'semver', 'status'],
          properties: {
            pubkey: { type: 'string' },
            app_name: { type: 'string' },
            semver: { type: 'string' },
            status: {
              type: 'string',
              enum: ['ok', 'yanked', 'tested'],
            },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey, app_name, semver, status, comment = '' } = request.body;

      if (!validatePublicKey(pubkey)) {
        return reply.code(400).send({ error: 'Invalid public key' });
      }

      if (!validateSemver(semver)) {
        return reply.code(400).send({ error: 'Invalid semver format' });
      }

      const attestationKey = `${pubkey}/${app_name}/${semver}`;
      const attestation = {
        status,
        comment,
        timestamp: new Date().toISOString(),
      };

      attestations.set(attestationKey, attestation);

      reply.code(201).send({
        message: 'Attestation created successfully',
        attestation_key: attestationKey,
      });
    }
  );
}

module.exports = routes;
