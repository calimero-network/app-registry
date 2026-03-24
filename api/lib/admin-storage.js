const { kv } = require('./kv-client');
const { createAdminStorage } = require('../../shared/admin-storage');

module.exports = createAdminStorage(kv);
