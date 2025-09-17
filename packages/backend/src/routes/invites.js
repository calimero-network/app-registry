const {
  createInvite,
  getInvite,
  redeemInvite,
  getPendingInvites,
} = require('../models/developer-registry');
const {
  generateKeyPair,
  createCertificateTemplate,
  signCertificate,
} = require('../lib/certificate-signer');
// const config = require('../config'); // TODO: Use for environment-specific settings

async function routes(fastify, _options) {
  // POST /invites - Create a new invite (Admin only)
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'name'],
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            github: { type: 'string' },
            company: { type: 'string' },
            role: { type: 'string' },
            expiresInDays: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              default: 7,
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              invite_token: { type: 'string' },
              invite_link: { type: 'string' },
              expires_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const developerInfo = {
          ...request.body,
          createdBy: 'admin', // TODO: Get from auth context
        };

        const invite = createInvite(developerInfo);

        // Generate invite link
        const baseUrl = process.env.REGISTRY_URL || 'http://localhost:8082';
        const inviteLink = `${baseUrl}/invites/${invite.token}/redeem`;

        reply.code(201).send({
          message: 'Invite created successfully',
          invite_token: invite.token,
          invite_link: inviteLink,
          expires_at: invite.expires_at,
        });
      } catch (error) {
        reply.code(500).send({
          error: 'Failed to create invite',
          details: error.message,
        });
      }
    }
  );

  // GET /invites - List pending invites (Admin only)
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                created_at: { type: 'string' },
                expires_at: { type: 'string' },
                status: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const invites = getPendingInvites();

        // Remove sensitive token from response
        const safeInvites = invites.map(invite => ({
          token: `${invite.token.substring(0, 8)}...`,
          email: invite.email,
          name: invite.name,
          created_at: invite.created_at,
          expires_at: invite.expires_at,
          status: invite.status,
        }));

        reply.send(safeInvites);
      } catch (error) {
        reply.code(500).send({
          error: 'Failed to list invites',
          details: error.message,
        });
      }
    }
  );

  // GET /invites/:token - Get invite details
  fastify.get(
    '/:token',
    {
      schema: {
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
              company: { type: 'string' },
              expires_at: { type: 'string' },
              status: { type: 'string' },
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
      try {
        const { token } = request.params;
        const invite = getInvite(token);

        if (!invite) {
          return reply.code(404).send({
            error: 'Invite not found or expired',
          });
        }

        // Return safe invite info (no token)
        reply.send({
          email: invite.email,
          name: invite.name,
          company: invite.company,
          github: invite.github,
          role: invite.role,
          expires_at: invite.expires_at,
          status: invite.status,
        });
      } catch (error) {
        reply.code(500).send({
          error: 'Failed to get invite',
          details: error.message,
        });
      }
    }
  );

  // GET /invites/:token/redeem - Redeem invite and get certificate
  fastify.get(
    '/:token/redeem',
    {
      schema: {
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              certificate: {
                type: 'object',
                properties: {
                  developer_pubkey: { type: 'string' },
                  certificate_id: { type: 'string' },
                  issued_at: { type: 'string' },
                  expires_at: { type: 'string' },
                  status: { type: 'string' },
                  issuer: { type: 'string' },
                  issuer_pubkey: { type: 'string' },
                  signature: {
                    type: 'object',
                    properties: {
                      alg: { type: 'string' },
                      sig: { type: 'string' },
                      signed_at: { type: 'string' },
                    },
                  },
                  developer_private_key: { type: 'string' },
                },
              },
              developer: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  joined_at: { type: 'string' },
                },
              },
              instructions: {
                type: 'object',
                properties: {
                  step1: { type: 'string' },
                  step2: { type: 'string' },
                  step3: { type: 'string' },
                  step4: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { token } = request.params;
        const invite = getInvite(token);

        if (!invite) {
          return reply.code(404).send({
            error: 'Invite not found or expired',
          });
        }

        if (invite.status !== 'pending') {
          return reply.code(400).send({
            error: 'Invite already redeemed',
          });
        }

        // Generate Ed25519 keypair for the developer
        const devKeys = generateKeyPair();

        // Load registry keys for signing
        const fs = require('fs');
        const path = require('path');
        const registryKeysPath = path.join(
          __dirname,
          '../../../registry-keys.json'
        );

        let registryKeys;
        if (fs.existsSync(registryKeysPath)) {
          registryKeys = JSON.parse(fs.readFileSync(registryKeysPath, 'utf8'));
        } else {
          // Generate registry keys if they don't exist
          registryKeys = generateKeyPair();
          fs.writeFileSync(
            registryKeysPath,
            JSON.stringify(registryKeys, null, 2)
          );
        }

        // Create certificate
        const certificateId = `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year validity

        // Create developer public key in ed25519: format
        const developerPubkey = `ed25519:${devKeys.publicKey}`;

        const certTemplate = createCertificateTemplate(
          developerPubkey,
          certificateId,
          registryKeys.publicKey,
          expiresAt.toISOString()
        );

        // Sign the certificate
        const signedCertificate = signCertificate(
          certTemplate,
          registryKeys.privateKey
        );

        // Also include the developer's private key in the certificate for convenience
        signedCertificate.developer_private_key = devKeys.privateKey;

        // Redeem the invite
        const developer = redeemInvite(token, certificateId);

        // Add certificate to developer registry
        const {
          addCertificateToDeveloper,
        } = require('../models/developer-registry');
        addCertificateToDeveloper(
          invite.email,
          certificateId,
          signedCertificate
        );

        // Set headers for JSON response
        reply.header('Content-Type', 'application/json');

        // Send certificate response
        reply.send({
          message:
            'Certificate generated successfully! Save this file and install it using: ssapp-registry certificate install certificate.json',
          certificate: signedCertificate,
          developer: {
            name: developer.name,
            email: developer.email,
            joined_at: developer.joined_at,
          },
          instructions: {
            step1: 'Save this response as certificate.json',
            step2: 'Install CLI: npm install -g @ssapp-registry/cli',
            step3:
              'Install certificate: ssapp-registry certificate install certificate.json',
            step4: 'Start publishing: ssapp-registry apps publish --help',
          },
        });
      } catch (error) {
        reply.code(500).send({
          error: 'Failed to redeem invite',
          details: error.message,
        });
      }
    }
  );
}

module.exports = routes;
