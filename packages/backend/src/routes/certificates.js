const { validatePublicKey } = require('../lib/verify');
const {
  isDeveloperWhitelisted,
} = require('../models/certificate');
const config = require('../config');

async function routes(fastify, _options) {
  // GET /certificates/{pubkey} - Check if developer is whitelisted
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
              whitelisted: { type: 'boolean' },
              certificate: {
                type: 'object',
                properties: {
                  developer_pubkey: { type: 'string' },
                  certificate_id: { type: 'string' },
                  issued_at: { type: 'string', format: 'date-time' },
                  expires_at: { type: 'string', format: 'date-time' },
                  status: { type: 'string', enum: ['active', 'revoked'] },
                  issuer: { type: 'string' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
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

      const whitelistCheck = isDeveloperWhitelisted(pubkey);

      if (!whitelistCheck.whitelisted) {
        return reply.code(404).send({
          error: 'Developer not found in whitelist',
          details: whitelistCheck.error,
        });
      }

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return {
        whitelisted: true,
        certificate: {
          developer_pubkey: whitelistCheck.certificate.developer_pubkey,
          certificate_id: whitelistCheck.certificate.certificate_id,
          issued_at: whitelistCheck.certificate.issued_at,
          expires_at: whitelistCheck.certificate.expires_at,
          status: whitelistCheck.certificate.status,
          issuer: whitelistCheck.certificate.issuer,
        },
      };
    }
  );
}

module.exports = routes;
