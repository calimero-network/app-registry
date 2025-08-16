const { validatePublicKey } = require('../lib/verify');
const config = require('../config');

// In-memory storage for demo (replace with database in production)
let developers;

// Function to get developers data for statistics
function getDevelopersData() {
  return Array.from(developers.values());
}

async function routes(fastify, options) {
  // Use shared data if provided, otherwise create new Map
  developers = options.sharedData?.developers || new Map();
  // GET /developers/{pubkey} - Get developer profile
  fastify.get(
    '/:pubkey',
    {
      schema: {
        params: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              display_name: { type: 'string' },
              website: { type: 'string' },
              proofs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    value: { type: 'string' },
                    verified: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey } = request.params;

      if (!validatePublicKey(pubkey)) {
        return reply.code(400).send({ error: 'Invalid public key' });
      }

      const developer = developers.get(pubkey);

      if (!developer) {
        return reply.code(404).send({ error: 'Developer not found' });
      }

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return developer;
    }
  );

  // POST /developers - Register developer profile (not in OpenAPI spec but needed for demo)
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['pubkey', 'display_name'],
          properties: {
            pubkey: { type: 'string' },
            display_name: { type: 'string' },
            website: { type: 'string' },
            proofs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'string' },
                  verified: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey, display_name, website, proofs = [] } = request.body;

      if (!validatePublicKey(pubkey)) {
        return reply.code(400).send({ error: 'Invalid public key' });
      }

      const developer = {
        display_name,
        website,
        proofs,
      };

      developers.set(pubkey, developer);

      reply.code(201).send({
        message: 'Developer profile registered successfully',
        pubkey,
      });
    }
  );
}

module.exports = routes;
module.exports.getDevelopersData = getDevelopersData;
module.exports.developers = developers;
