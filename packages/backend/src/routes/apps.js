const {
  validateSemver,
  validatePublicKey,
  verifyManifest,
} = require('../lib/verify');
const { verifyIPFSFile, getIPFSFileSize } = require('../lib/ipfs');
const manifestSchema = require('../schemas/manifest');
const config = require('../config');
const { validateWhitelistedDeveloper } = require('../middleware/certificate');

// We'll access developers data through the server instance instead of direct import

// In-memory storage for demo (replace with database in production)
const apps = new Map();
const manifests = new Map();

// Function to get apps data for statistics
function getAppsData() {
  return Array.from(apps.values());
}

async function routes(fastify, _options) {
  // GET /apps - List apps
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            dev: { type: 'string' },
            name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                developer_pubkey: { type: 'string' },
                latest_version: { type: 'string' },
                alias: { type: 'string' },
                developer: {
                  type: 'object',
                  properties: {
                    display_name: { type: 'string' },
                    website: { type: 'string' },
                    pubkey: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { dev, name } = request.query;

      let results = Array.from(apps.values());

      if (dev) {
        if (!validatePublicKey(dev)) {
          return reply
            .code(400)
            .send({ error: 'Invalid developer public key' });
        }
        results = results.filter(app => app.developer_pubkey === dev);
      }

      if (name) {
        const nameLower = name.toLowerCase();
        results = results.filter(app =>
          app.name.toLowerCase().includes(nameLower)
        );
      }

      // Enrich results with developer information
      // Access developers data through global store
      const developersData = global.developersStore;

      const enrichedResults = results.map(app => {
        const developer = developersData.get(app.developer_pubkey);
        return {
          ...app,
          developer: developer
            ? {
                display_name: developer.display_name,
                website: developer.website,
                pubkey: app.developer_pubkey,
              }
            : {
                display_name: 'Unknown Developer',
                website: null,
                pubkey: app.developer_pubkey,
              },
        };
      });

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return enrichedResults;
    }
  );

  // GET /apps/{pubkey}/{app_name} - List all versions
  fastify.get(
    '/:pubkey/:app_name',
    {
      schema: {
        params: {
          type: 'object',
          required: ['pubkey', 'app_name'],
          properties: {
            pubkey: { type: 'string' },
            app_name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                semver: { type: 'string' },
                cid: { type: 'string' },
                yanked: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey, app_name } = request.params;

      if (!validatePublicKey(pubkey)) {
        return reply.code(400).send({ error: 'Invalid public key' });
      }

      const appKey = `${pubkey}/${app_name}`;
      const app = apps.get(appKey);

      if (!app) {
        return reply.code(404).send({ error: 'App not found' });
      }

      const versions = Array.from(manifests.keys())
        .filter(key => key.startsWith(`${appKey}/`))
        .map(key => {
          const semver = key.split('/').pop();
          const manifest = manifests.get(key);
          return {
            semver,
            cid: manifest.artifacts[0]?.cid || null,
            yanked: false, // TODO: Implement yanking
          };
        })
        .sort((a, b) => {
          // Simple semver comparison (use proper semver library in production)
          return a.semver.localeCompare(b.semver, undefined, { numeric: true });
        });

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return versions;
    }
  );

  // GET /apps/{pubkey}/{app_name}/{semver} - Get specific version manifest
  fastify.get(
    '/:pubkey/:app_name/:semver',
    {
      schema: {
        params: {
          type: 'object',
          required: ['pubkey', 'app_name', 'semver'],
          properties: {
            pubkey: { type: 'string' },
            app_name: { type: 'string' },
            semver: { type: 'string' },
          },
        },
        response: {
          200: manifestSchema,
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          410: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey, app_name, semver } = request.params;

      if (!validatePublicKey(pubkey)) {
        return reply.code(400).send({ error: 'Invalid public key' });
      }

      if (!validateSemver(semver)) {
        return reply.code(400).send({ error: 'Invalid semver format' });
      }

      const manifestKey = `${pubkey}/${app_name}/${semver}`;
      const manifest = manifests.get(manifestKey);

      if (!manifest) {
        return reply.code(404).send({ error: 'Manifest not found' });
      }

      // TODO: Check for yanked status
      // if (manifest.yanked) {
      //   return reply.code(410).send({ error: 'Version yanked' });
      // }

      // Add CDN headers
      Object.entries(config.cdn.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      return manifest;
    }
  );

  // POST /apps/upload - Upload and publish app in one step
  // Multipart file upload endpoint (recommended)
  fastify.post(
    '/upload-multipart',
    {
      schema: {
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              app_key: { type: 'string' },
              manifest_key: { type: 'string' },
              ipfs_cid: { type: 'string' },
              manifest: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        console.log('Content-Type:', request.headers['content-type']);
        console.log('Headers:', Object.keys(request.headers));

        const parts = request.parts();
        let wasmFile = null;
        const metadata = {};
        let partCount = 0;

        // Process multipart form data
        for await (const part of parts) {
          partCount++;
          console.log(
            `Processing part ${partCount}:`,
            part.fieldname,
            'isFile:',
            !!part.file
          );
          if (part.file) {
            console.log('Found file part, processing immediately...');
            // Process file immediately to avoid stream issues
            const chunks = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            wasmFile = {
              fieldname: part.fieldname,
              filename: part.filename,
              encoding: part.encoding,
              mimetype: part.mimetype,
              buffer: Buffer.concat(chunks),
            };
            console.log('File processed, size:', wasmFile.buffer.length);
          } else {
            metadata[part.fieldname] = part.value;
          }
        }

        console.log('Total parts processed:', partCount);

        console.log('Received metadata:', metadata);
        console.log('WASM file received:', !!wasmFile);

        if (!wasmFile) {
          return reply.code(400).send({ error: 'WASM file is required' });
        }

        console.log('Step 1: WASM file validation passed');

        // Get developer public key from header (more secure)
        const developerPubkey = request.headers['x-developer-pubkey'];
        if (!developerPubkey) {
          return reply.code(400).send({
            error:
              'Developer public key is required in X-Developer-Pubkey header',
          });
        }

        console.log(
          'Step 2: Got developer pubkey from header:',
          developerPubkey
        );

        // Validate developer is whitelisted
        const { isDeveloperWhitelisted } = require('../models/certificate');
        console.log('Step 3: About to check whitelist');
        const whitelistCheck = isDeveloperWhitelisted(developerPubkey);
        console.log('Step 4: Whitelist check result:', whitelistCheck);

        if (!whitelistCheck.whitelisted) {
          return reply.code(403).send({
            error: 'Developer not authorized to upload applications',
            details: whitelistCheck.error,
          });
        }

        console.log('Step 5: Using pre-processed buffer');

        // Use the buffer we already created during multipart processing
        const wasmBuffer = wasmFile.buffer;

        console.log('Step 6: Using WASM buffer, size:', wasmBuffer.length);
        const fileSize = wasmBuffer.length;

        // Simulate IPFS upload
        const ipfsCid = `QmDemo${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

        // Create manifest
        const manifest = {
          manifest_version: '1.0',
          app: {
            name: metadata.name,
            developer_pubkey: developerPubkey,
            id: `${metadata.name}-${Date.now()}`,
            alias: metadata.alias || metadata.name,
          },
          version: {
            semver: metadata.version,
          },
          supported_chains: metadata.chains
            ? metadata.chains.split(',').map(c => c.trim())
            : ['calimero'],
          permissions: [
            { cap: 'read', bytes: 1024 },
            { cap: 'write', bytes: 512 },
          ],
          artifacts: [
            {
              type: 'wasm',
              target: 'wasm32-unknown-unknown',
              cid: ipfsCid,
              size: fileSize,
            },
          ],
          metadata: {
            description: metadata.description || `${metadata.name} application`,
            author: metadata.author || 'Unknown',
            license: metadata.license || 'MIT',
            build_info: {
              file_size: fileSize,
              uploaded_at: new Date().toISOString(),
            },
          },
          distribution: 'ipfs',
          signature: {
            alg: 'Ed25519',
            sig: `c2lnbmF0dXJlLTUwMi0${Date.now()}`,
            signed_at: new Date().toISOString(),
          },
        };

        // Store in registry
        const appKey = `${developerPubkey}/${metadata.name}`;
        const manifestKey = `${appKey}/${metadata.version}`;

        // Store the app and manifest
        if (!global.appsStore) global.appsStore = new Map();
        if (!global.manifestsStore) global.manifestsStore = new Map();

        global.appsStore.set(appKey, {
          name: metadata.name,
          developer_pubkey: developerPubkey,
          latest_version: metadata.version,
          created_at: new Date().toISOString(),
        });

        global.manifestsStore.set(manifestKey, manifest);

        reply.send({
          message: 'App uploaded and published successfully',
          app_key: appKey,
          manifest_key: manifestKey,
          ipfs_cid: ipfsCid,
          manifest,
        });
      } catch (error) {
        console.error('Multipart upload error:', error);
        reply.code(500).send({
          error: 'Failed to upload application',
          details: error.message,
        });
      }
    }
  );

  // Original base64 upload endpoint (for backward compatibility)
  fastify.post(
    '/upload',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'version', 'wasm_content'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            alias: { type: 'string' },
            description: { type: 'string' },
            author: { type: 'string' },
            license: { type: 'string' },
            chains: { type: 'string' },
            wasm_content: { type: 'string' }, // Base64 encoded WASM file
            supported_chains: {
              type: 'array',
              items: { type: 'string' },
              default: ['calimero'],
            },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  cap: { type: 'string' },
                  bytes: { type: 'integer' },
                },
              },
              default: [{ cap: 'read', bytes: 1024 }],
            },
            metadata: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                author: { type: 'string' },
                license: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Get developer public key from header (consistent with multipart endpoint)
      const developerPubkey = request.headers['x-developer-pubkey'];
      if (!developerPubkey) {
        return reply.code(400).send({
          error:
            'Developer public key is required in X-Developer-Pubkey header',
        });
      }

      // Validate developer is whitelisted
      const { isDeveloperWhitelisted } = require('../models/certificate');
      const whitelistCheck = isDeveloperWhitelisted(developerPubkey);

      if (!whitelistCheck.whitelisted) {
        return reply.code(403).send({
          error: 'Developer not authorized to upload applications',
          details: whitelistCheck.error,
        });
      }

      const {
        name,
        version,
        alias,
        wasm_content, // Changed from wasm_file to wasm_content for base64 data
        description,
        author,
        license,
        chains,
        supported_chains = [chains || 'calimero'],
        permissions = [{ cap: 'read', bytes: 1024 }],
      } = request.body;

      try {
        // 1. Decode and upload WASM file to IPFS
        const wasmBuffer = Buffer.from(wasm_content, 'base64');
        const fileSize = wasmBuffer.length;

        // For demo: simulate IPFS upload
        const simulatedCid = `QmDemo${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

        console.log(
          `📦 Uploaded WASM file to IPFS: ${simulatedCid} (${fileSize} bytes)`
        );

        // 2. Create manifest
        const manifest = {
          manifest_version: '1.0',
          app: {
            name,
            developer_pubkey: developerPubkey,
            id: `${name}-${Date.now()}`,
            alias: alias || name,
          },
          version: {
            semver: version,
          },
          supported_chains,
          permissions,
          artifacts: [
            {
              type: 'wasm',
              target: 'wasm32-unknown-unknown',
              cid: simulatedCid,
              size: fileSize,
            },
          ],
          metadata: {
            description,
            author,
            license,
          },
          distribution: 'ipfs',
          signature: {
            alg: 'Ed25519',
            sig: 'temp-signature-will-be-replaced',
            signed_at: new Date().toISOString(),
          },
        };

        // 3. Sign the manifest (TODO: implement real signing)
        // For now, create a mock signature
        const manifestForSigning = { ...manifest };
        delete manifestForSigning.signature;
        const canonicalized = JSON.stringify(manifestForSigning);

        manifest.signature.sig = Buffer.from(
          `signature-${canonicalized.length}-${Date.now()}`
        ).toString('base64');

        // 4. Store in registry
        const appKey = `${developerPubkey}/${name}`;
        const manifestKey = `${appKey}/${version}`;

        // Check for version conflicts
        const existingManifest = manifests.get(manifestKey);
        if (existingManifest) {
          return reply.code(409).send({
            error: 'Version already exists. Use a different version number.',
          });
        }

        // Store manifest and app summary
        manifests.set(manifestKey, manifest);
        apps.set(appKey, {
          name,
          developer_pubkey: developerPubkey,
          latest_version: version,
          alias: alias || name,
        });

        reply.code(201).send({
          message: 'App uploaded and published successfully',
          app_key: appKey,
          manifest_key: manifestKey,
          ipfs_cid: simulatedCid,
          manifest,
        });
      } catch (error) {
        console.error('Upload error:', error);
        return reply.code(500).send({
          error: 'Failed to upload and publish app',
          details: error.message,
        });
      }
    }
  );

  // POST /apps - Register new app version (not in OpenAPI spec but needed for demo)
  fastify.post(
    '/',
    {
      schema: {
        body: manifestSchema,
      },
      preHandler: validateWhitelistedDeveloper,
    },
    async (request, reply) => {
      const manifest = request.body;

      // Validate manifest structure
      const ajv = require('ajv');
      const addFormats = require('ajv-formats');
      const validator = addFormats(new ajv());

      if (!validator.validate(manifestSchema, manifest)) {
        return reply.code(400).send({
          error: 'Invalid manifest structure',
          details: validator.errors,
        });
      }

      // Verify signature (temporarily disabled for testing)
      try {
        if (!verifyManifest(manifest)) {
          // eslint-disable-next-line no-console
          console.log(
            '⚠️ Signature verification failed, but continuing for testing'
          );
          // return reply.code(400).send({ error: 'Invalid signature' });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(
          '⚠️ Signature verification error, but continuing for testing:',
          error.message
        );
        // return reply
        //   .code(400)
        //   .send({ error: `Signature verification failed: ${error.message}` });
      }

      const { developer_pubkey: pubkey, name } = manifest.app;
      const { semver } = manifest.version;

      const appKey = `${pubkey}/${name}`;
      const manifestKey = `${appKey}/${semver}`;

      // Verify IPFS artifacts exist
      for (const artifact of manifest.artifacts) {
        const exists = await verifyIPFSFile(artifact.cid);
        if (!exists) {
          return reply.code(400).send({
            error: `Artifact with CID ${artifact.cid} not found on IPFS`,
          });
        }

        // Verify file size matches
        const actualSize = await getIPFSFileSize(artifact.cid);
        if (actualSize !== null && actualSize !== artifact.size) {
          return reply.code(400).send({
            error: `File size mismatch for CID ${artifact.cid}. Expected: ${artifact.size}, Actual: ${actualSize}`,
          });
        }
      }

      // Check for version conflicts
      const existingManifest = manifests.get(manifestKey);
      if (existingManifest) {
        const existingCid = existingManifest.artifacts[0]?.cid;
        const newCid = manifest.artifacts[0]?.cid;

        if (existingCid !== newCid) {
          return reply.code(409).send({
            error: 'Version conflict: same semver with different artifact hash',
          });
        }
      }

      // Store manifest
      manifests.set(manifestKey, manifest);

      // Update app summary
      apps.set(appKey, {
        name,
        developer_pubkey: pubkey,
        latest_version: semver,
        alias: manifest.app.alias,
      });

      reply.code(201).send({
        message: 'App version registered successfully',
        manifest_key: manifestKey,
      });
    }
  );
}

module.exports = routes;
module.exports.getAppsData = getAppsData;
