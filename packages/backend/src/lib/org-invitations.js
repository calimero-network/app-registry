const { kv } = require('./kv-client');
const {
  createOrgInvitations,
} = require('@calimero-network/registry-shared/org-invitations');

module.exports = { invitations: createOrgInvitations(kv) };
