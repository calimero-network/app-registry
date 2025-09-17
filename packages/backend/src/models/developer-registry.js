const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// File-based storage for demo (replace with database in production)
const REGISTRY_FILE = path.join(
  __dirname,
  '../../data/developer-registry.json'
);
const INVITES_FILE = path.join(__dirname, '../../data/pending-invites.json');

// Ensure data directory exists
const dataDir = path.dirname(REGISTRY_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Load developer registry from file
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading developer registry:', error);
  }
  return {
    developers: {},
    certificates: {},
  };
}

/**
 * Save developer registry to file
 */
function saveRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error('Error saving developer registry:', error);
    throw error;
  }
}

/**
 * Load pending invites from file
 */
function loadInvites() {
  try {
    if (fs.existsSync(INVITES_FILE)) {
      return JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading invites:', error);
  }
  return {};
}

/**
 * Save pending invites to file
 */
function saveInvites(invites) {
  try {
    fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
  } catch (error) {
    console.error('Error saving invites:', error);
    throw error;
  }
}

/**
 * Create a new developer invite
 */
function createInvite(developerInfo) {
  const invites = loadInvites();

  // Generate secure invite token
  const inviteToken = crypto.randomBytes(32).toString('hex');

  // Calculate expiration (default 7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (developerInfo.expiresInDays || 7));

  const invite = {
    token: inviteToken,
    email: developerInfo.email,
    name: developerInfo.name,
    github: developerInfo.github,
    company: developerInfo.company,
    role: developerInfo.role,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    created_by: developerInfo.createdBy || 'admin',
    status: 'pending', // pending, redeemed, expired
    redeemed_at: null,
    certificate_id: null,
  };

  invites[inviteToken] = invite;
  saveInvites(invites);

  return invite;
}

/**
 * Get invite by token
 */
function getInvite(token) {
  const invites = loadInvites();
  const invite = invites[token];

  if (!invite) {
    return null;
  }

  // Check if expired
  const now = new Date();
  const expiresAt = new Date(invite.expires_at);

  if (expiresAt < now) {
    invite.status = 'expired';
    saveInvites(invites);
    return null;
  }

  return invite;
}

/**
 * Redeem an invite (mark as used and create developer)
 */
function redeemInvite(token, certificateId) {
  const invites = loadInvites();
  const invite = invites[token];

  if (!invite || invite.status !== 'pending') {
    throw new Error('Invalid or already redeemed invite');
  }

  // Check if expired
  const now = new Date();
  const expiresAt = new Date(invite.expires_at);

  if (expiresAt < now) {
    invite.status = 'expired';
    saveInvites(invites);
    throw new Error('Invite has expired');
  }

  // Mark invite as redeemed
  invite.status = 'redeemed';
  invite.redeemed_at = new Date().toISOString();
  invite.certificate_id = certificateId;

  // Add developer to registry
  const registry = loadRegistry();
  const developerId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  registry.developers[developerId] = {
    id: developerId,
    email: invite.email,
    name: invite.name,
    github: invite.github,
    company: invite.company,
    role: invite.role,
    status: 'active',
    invited_at: invite.created_at,
    joined_at: new Date().toISOString(),
    certificate_ids: [certificateId],
  };

  saveInvites(invites);
  saveRegistry(registry);

  return registry.developers[developerId];
}

/**
 * Get developer by email
 */
function getDeveloperByEmail(email) {
  const registry = loadRegistry();

  for (const developer of Object.values(registry.developers)) {
    if (developer.email === email) {
      return developer;
    }
  }

  return null;
}

/**
 * Get all pending invites
 */
function getPendingInvites() {
  const invites = loadInvites();

  return Object.values(invites).filter(invite => {
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);

    if (expiresAt < now) {
      invite.status = 'expired';
    }

    return invite.status === 'pending';
  });
}

/**
 * Get all developers
 */
function getAllDevelopers() {
  const registry = loadRegistry();
  return Object.values(registry.developers);
}

/**
 * Add certificate to developer
 */
function addCertificateToDeveloper(email, certificateId, certificate) {
  const registry = loadRegistry();

  // Find developer by email
  let developer = null;
  for (const dev of Object.values(registry.developers)) {
    if (dev.email === email) {
      developer = dev;
      break;
    }
  }

  if (!developer) {
    throw new Error('Developer not found');
  }

  // Add certificate
  if (!developer.certificate_ids.includes(certificateId)) {
    developer.certificate_ids.push(certificateId);
  }

  registry.certificates[certificateId] = certificate;

  saveRegistry(registry);
  return developer;
}

/**
 * Check if developer is whitelisted by public key
 */
function isDeveloperWhitelistedByPubkey(pubkey) {
  const registry = loadRegistry();

  // Find certificate with matching developer_pubkey
  for (const [certId, cert] of Object.entries(registry.certificates)) {
    if (cert.developer_pubkey === pubkey) {
      // Find associated developer
      for (const dev of Object.values(registry.developers)) {
        if (dev.certificate_ids.includes(certId)) {
          return {
            whitelisted: true,
            certificate: cert,
            developer: dev,
          };
        }
      }
    }
  }

  return { whitelisted: false, error: 'Developer not found in whitelist' };
}

module.exports = {
  createInvite,
  getInvite,
  redeemInvite,
  getDeveloperByEmail,
  getPendingInvites,
  getAllDevelopers,
  addCertificateToDeveloper,
  isDeveloperWhitelistedByPubkey,
};
