const { isDeveloperWhitelisted } = require('../models/certificate');

/**
 * Middleware to validate that a developer is whitelisted before allowing app uploads
 */
async function validateWhitelistedDeveloper(request, reply) {
  // Only apply to POST requests (uploads)
  if (request.method !== 'POST') {
    return;
  }

  const developerPubkey = request.body?.developer_pubkey || request.body?.app?.developer_pubkey;
  
  if (!developerPubkey) {
    return reply.code(400).send({ 
      error: 'Developer public key is required' 
    });
  }

  const whitelistCheck = isDeveloperWhitelisted(developerPubkey);
  
  if (!whitelistCheck.whitelisted) {
    return reply.code(403).send({ 
      error: 'Developer not authorized to upload applications',
      details: whitelistCheck.error
    });
  }

  // Add certificate info to request for logging/auditing
  request.certificate = whitelistCheck.certificate;
}

module.exports = {
  validateWhitelistedDeveloper,
};
