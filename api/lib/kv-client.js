/**
 * The serverless routes' Redis client.
 *
 * Re-exports the backend's client rather than building its own: a function
 * that also uses the bundle store (which imports the backend client directly)
 * would otherwise hold two connections and connect twice on every cold start.
 * See packages/backend/src/lib/kv-client.js.
 */
module.exports = require('@calimero-network/registry-backend/src/lib/kv-client');
