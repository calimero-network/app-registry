const { kv } = require('./kv-client');
const {
  createApiTokenStorage,
} = require('@calimero-network/registry-shared/api-token-storage');

module.exports = { apiTokens: createApiTokenStorage(kv) };
