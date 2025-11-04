/**
 * Submit Manifest Endpoint
 * POST /api/v1/apps
 */

const { V1StorageKV } = require('../../../packages/backend/src/lib/v1-storage-kv');
const { V1Utils } = require('../../../packages/backend/src/lib/v1-utils');
const { v1ManifestSchema } = require('../../../packages/backend/src/schemas/v1-manifest');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Singleton instances (persists across warm starts)
let storage;
let ajv;
let validateManifest;

function init() {
  if (!storage) {
    storage = new V1StorageKV();
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validateManifest = ajv.compile(v1ManifestSchema);
  }
}

module.exports = async (req, res) => {
  init();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const manifest = req.body;

    // Validate schema with AJV
    const valid = validateManifest(manifest);
    if (!valid) {
      return res.status(400).json({
        error: 'invalid_schema',
        details: validateManifest.errors.map(e => `${e.instancePath} ${e.message}`),
      });
    }

    // Validate manifest structure with custom rules
    const validation = V1Utils.validateManifest(manifest);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'invalid_schema',
        details: validation.errors,
      });
    }

    // Validate digest format
    if (!V1Utils.validateDigest(manifest.artifact.digest)) {
      return res.status(400).json({
        error: 'invalid_digest',
        details: 'artifact.digest must be in format "sha256:<64hex>"',
      });
    }

    // Validate URI format
    if (!V1Utils.validateUri(manifest.artifact.uri)) {
      return res.status(400).json({
        error: 'invalid_uri',
        details: 'artifact.uri must start with "https://" or "ipfs://"',
      });
    }

    // Verify signature if present
    if (manifest.signature) {
      const signatureResult = V1Utils.verifySignature(manifest);
      if (!signatureResult.valid) {
        return res.status(400).json({
          error: 'invalid_signature',
          details: signatureResult.error,
        });
      }
    }

    // Check if manifest already exists
    const exists = await storage.hasManifest(manifest.id, manifest.version);
    if (exists) {
      return res.status(409).json({
        error: 'already_exists',
        details: `Manifest ${manifest.id}@${manifest.version} already exists`,
      });
    }

    // Store manifest
    await storage.storeManifest(manifest);

    return res.status(201).json({
      id: manifest.id,
      version: manifest.version,
      canonical_uri: `/v1/apps/${manifest.id}/${manifest.version}`,
    });
  } catch (error) {
    console.error('Error in POST /v1/apps:', error);
    return res.status(500).json({
      error: 'internal_error',
      details: error.message,
    });
  }
};

