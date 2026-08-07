const { kv } = require('./kv-client');
const { createRefreshStorage } = require('../../shared/refresh-storage');
const { REFRESH_MAX_AGE } = require('../../shared/session-cookies');

module.exports = {
  refresh: createRefreshStorage(kv, { maxAgeSeconds: REFRESH_MAX_AGE }),
};
