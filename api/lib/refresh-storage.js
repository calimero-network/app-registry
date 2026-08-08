const { kv } = require('./kv-client');
const {
  createRefreshStorage,
} = require('@calimero-network/registry-shared/refresh-storage');
const {
  REFRESH_MAX_AGE,
} = require('@calimero-network/registry-shared/session-cookies');

module.exports = {
  refresh: createRefreshStorage(kv, { maxAgeSeconds: REFRESH_MAX_AGE }),
};
