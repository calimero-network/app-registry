const { invitations } = require('./org-invitations');
const { getOrg, getOrgMemberRole, addOrgMember } = require('./org-storage');
const { getUserByEmail, getUserByUsername } = require('./user-storage');
const { isBot } = require('./admin-storage');
const {
  createInvitationFlow,
} = require('@calimero-network/registry-shared/org-invitation-flow');

module.exports = {
  flow: createInvitationFlow({
    invitations,
    getOrg,
    getOrgMemberRole,
    addOrgMember,
    getUserByEmail,
    getUserByUsername,
    isBot,
  }),
};
