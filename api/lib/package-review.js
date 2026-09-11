const { kv } = require('./kv-client');
const {
  createPackageReview,
} = require('@calimero-network/registry-shared/package-review');

module.exports = createPackageReview(kv);
