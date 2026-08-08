const { kv } = require('./kv-client');
const {
  createAdminStorage,
} = require('@calimero-network/registry-shared/admin-storage');

module.exports = createAdminStorage(kv);
