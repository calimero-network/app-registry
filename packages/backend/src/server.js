const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fastify = require('fastify');
const cookie = require('@fastify/cookie');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const fs = require('fs');
const os = require('os');
const semver = require('semver');
const tar = require('tar');

// Import config
const config = require('./config');
const { BundleStorageKV } = require('./lib/bundle-storage-kv');
const { kv } = require('./lib/kv-client');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  normalizeSignature,
} = require('./lib/verify');
const {
  isAllowedToPublish,
  getPkg2Org,
  getOrgMemberRole,
} = require('./lib/org-storage');
const { verifySessionToken, verifyApiToken } = require('./lib/auth');
const { getUserByEmail } = require('./lib/user-storage');

async function buildServer() {
  const server = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register cookie (required for auth session and OAuth state)
  await server.register(cookie);

  // Register CORS
  await server.register(cors, {
    origin: [
      ...(config.cors?.origin || []),
      'http://localhost:1420', // Desktop app dev
      'http://localhost:3000', // Alternative dev port
      'http://localhost:8080', // Registry dev server
      'tauri://localhost', // Tauri apps
      'https://tauri.localhost', // Tauri apps
      'http://localhost:5173', // Vite dev server
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await server.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max for .mpk
  });

  // Register Swagger
  const yaml = require('js-yaml');
  const openapiSpec = yaml.load(
    fs.readFileSync(path.join(__dirname, '../api.yml'), 'utf8')
  );
  await server.register(swagger, {
    openapi: openapiSpec,
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Auth routes (Google OAuth, session cookie, /api/auth/me, /api/auth/logout)
  await server.register(require('./routes/auth-routes'), { config });

  // Org routes (NPM-style organizations: CRUD orgs, members, package link)
  await server.register(require('./routes/org-routes'));

  // Admin routes (admin dashboard: users, packages, orgs management)
  await server.register(require('./routes/admin-routes'), { config });

  // Health endpoint
  const healthHandler = async (_request, _reply) => {
    return { status: 'ok' };
  };
  server.get('/healthz', healthHandler);
  server.get('/api/healthz', healthHandler);

  // Statistics endpoint (optimized to avoid N+1 queries)
  const statsHandler = async (_request, _reply) => {
    try {
      // Get all bundle keys efficiently (parallel queries)
      const bundleKeys = await bundleStorage.getAllBundleKeys();

      // Count total bundles (all versions)
      const totalBundles = bundleKeys.length;

      // Batch fetch all manifests in parallel
      const bundles = await bundleStorage.getBundleManifestsBatch(bundleKeys);

      // Count unique developers (from metadata.author, falling back to signature.pubkey)
      const developers = new Set();
      for (const bundle of bundles) {
        const author = bundle?.metadata?.author || bundle?.signature?.pubkey;
        if (author) {
          developers.add(author);
        }
      }

      // Count unique packages
      const uniquePackages = new Set(
        bundleKeys.map(bundleKey => bundleKey.package)
      ).size;

      return {
        publishedBundles: totalBundles,
        uniquePackages,
        publishedApps: uniquePackages,
        activeDevelopers: developers.size,
        totalDownloads: Number(await kv.get('downloads:total')) || 0,
      };
    } catch (error) {
      server.log.error('Error in GET /stats:', error);
      return {
        publishedBundles: 0,
        uniquePackages: 0,
        publishedApps: 0,
        activeDevelopers: 0,
        totalDownloads: 0,
        error: 'Failed to calculate statistics',
      };
    }
  };
  server.get('/stats', statsHandler);
  server.get('/api/stats', statsHandler);

  // Use BundleStorageKV for v2 bundle storage
  const bundleStorage = new BundleStorageKV();

  // Seed with test apps on startup for E2E testing
  const seedTestApps = async () => {
    // Real WASM file hash (kv-store.wasm)
    const wasmHash =
      '587d96f54984f62b2b1d834f07f4f162a9ab8c9a9d17a7d51f9baffca1f0b343';
    const wasmUrl = `http://localhost:${process.env.PORT || 8080}/artifacts/kv_store.wasm`;
    // Get WASM file size (approximate - kv_store.wasm is ~283KB)
    const wasmSize = 283441;

    // V2 Bundle format - Test App
    const testAppBundle = {
      version: '1.0', // Internal manifest version
      package: 'com.calimero.test-app',
      appVersion: '1.0.0',
      metadata: {
        name: 'Test App',
        description:
          'A simple test application for E2E testing (uses kv-store WASM)',
        author: 'Calimero Team',
      },
      interfaces: {
        exports: [],
        uses: [],
      },
      wasm: {
        path: wasmUrl,
        size: wasmSize,
        hash: wasmHash,
      },
      abi: null,
      migrations: [],
      links: null,
      signature: {
        alg: 'ed25519',
        sig: 'test-signature',
        pubkey:
          'ed25519:1111111111111111111111111111111111111111111111111111111111111111',
        signedAt: new Date().toISOString(),
      },
    };

    // V2 Bundle format - Frontend Demo App
    const frontendDemoBundle = {
      version: '1.0',
      package: 'com.calimero.frontend-demo',
      appVersion: '1.0.0',
      metadata: {
        name: 'Frontend Demo App',
        description:
          'A test application with a frontend link for testing frontend launch functionality',
        author: 'Calimero Team',
      },
      interfaces: {
        exports: [],
        uses: [],
      },
      wasm: {
        path: wasmUrl,
        size: wasmSize,
        hash: wasmHash,
      },
      abi: null,
      migrations: [],
      links: {
        frontend: 'https://www.calimero.network/',
        github: 'https://github.com/calimero-network',
        docs: 'https://docs.calimero.network',
      },
      signature: {
        alg: 'ed25519',
        sig: 'test-signature-2',
        pubkey:
          'ed25519:2222222222222222222222222222222222222222222222222222222222222222',
        signedAt: new Date().toISOString(),
      },
    };

    // Store bundles (only if they don't exist)
    try {
      await bundleStorage.storeBundleManifest(testAppBundle);
      server.log.info('✅ Seeded test-app bundle');
    } catch (err) {
      if (err.message.includes('already exists')) {
        server.log.info('ℹ️  test-app bundle already exists');
      } else {
        server.log.warn('⚠️  Failed to seed test-app bundle:', err.message);
      }
    }

    try {
      await bundleStorage.storeBundleManifest(frontendDemoBundle);
      server.log.info('✅ Seeded frontend-demo bundle');
    } catch (err) {
      if (err.message.includes('already exists')) {
        server.log.info('ℹ️  frontend-demo bundle already exists');
      } else {
        server.log.warn(
          '⚠️  Failed to seed frontend-demo bundle:',
          err.message
        );
      }
    }
  };

  // Seed test apps only in development mode
  // In production, bundles should be pushed via the API
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.SEED_TEST_APPS !== 'false'
  ) {
    await seedTestApps();
  } else {
    server.log.info(
      'ℹ️  Skipping test app seeding (production mode or SEED_TEST_APPS=false)'
    );
  }

  // Normalize bundle for client: compute verified server-side, strip internal email fields.
  const sanitizeBundle = async bundle => {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const raw =
      bundle.min_runtime_version ?? bundle.minRuntimeVersion ?? '0.1.0';
    const minRuntimeVersion =
      raw != null && String(raw).trim() ? String(raw).trim() : '0.1.0';

    const meta = bundle.metadata ? { ...bundle.metadata } : {};
    const ownerEmail = (meta._ownerEmail || '').toLowerCase();
    const hadAdminVerified = !!meta._adminVerified;
    delete meta._ownerEmail;
    delete meta._adminVerified;

    let verified = hadAdminVerified;

    if (!verified) {
      const pkgKey = await kv.get(`admin_verified:package:${bundle.package}`);
      if (pkgKey === '1') verified = true;
    }
    if (!verified && ownerEmail.endsWith('@calimero.network')) {
      verified = true;
    }
    if (!verified && ownerEmail) {
      const userId = await kv.get(`email2user:${ownerEmail}`);
      if (userId) {
        const userRaw = await kv.get(`user:${userId}`);
        if (userRaw) {
          try {
            const user = JSON.parse(userRaw);
            if (user.verified) verified = true;
          } catch {
            /* skip */
          }
        }
        if (!verified) {
          const adminVerified = await kv.get(`admin_verified:user:${userId}`);
          if (adminVerified === '1') verified = true;
        }
      }
    }

    return {
      ...bundle,
      metadata: meta,
      min_runtime_version: minRuntimeVersion,
      minRuntimeVersion,
      verified,
    };
  };

  // Batch version of sanitizeBundle for listings — 2 parallel Redis rounds instead of 4N sequential.
  const sanitizeBundles = async rawItems => {
    // Step 1: extract metadata synchronously
    const processed = rawItems.map(({ bundle, packageName }) => {
      const raw =
        bundle.min_runtime_version ?? bundle.minRuntimeVersion ?? '0.1.0';
      const minRuntimeVersion =
        raw != null && String(raw).trim() ? String(raw).trim() : '0.1.0';
      const meta = bundle.metadata ? { ...bundle.metadata } : {};
      const ownerEmail = (meta._ownerEmail || '').toLowerCase();
      const hadAdminVerified = !!meta._adminVerified;
      delete meta._ownerEmail;
      delete meta._adminVerified;
      return {
        bundle,
        packageName,
        meta,
        ownerEmail,
        hadAdminVerified,
        minRuntimeVersion,
      };
    });

    // Step 2: batch round 1 — admin_verified:package + email2user
    const uniquePackages = [
      ...new Set(
        processed.map(p => p.packageName || p.bundle.package).filter(Boolean)
      ),
    ];
    const uniqueEmails = [
      ...new Set(
        processed
          .map(p => p.ownerEmail)
          .filter(e => e && !e.endsWith('@calimero.network'))
      ),
    ];
    const [pkgVerifiedVals, userIdVals] = await Promise.all([
      Promise.all(
        uniquePackages.map(p => kv.get(`admin_verified:package:${p}`))
      ),
      Promise.all(uniqueEmails.map(e => kv.get(`email2user:${e}`))),
    ]);
    const pkgVerifiedMap = Object.fromEntries(
      uniquePackages.map((p, i) => [p, pkgVerifiedVals[i] === '1'])
    );
    const emailToUserId = Object.fromEntries(
      uniqueEmails.map((e, i) => [e, userIdVals[i]])
    );

    // Step 3: batch round 2 — user records + admin_verified:user
    const uniqueUserIds = [
      ...new Set(Object.values(emailToUserId).filter(Boolean)),
    ];
    const [userVals, userAdminVerifiedVals] = uniqueUserIds.length
      ? await Promise.all([
          Promise.all(uniqueUserIds.map(id => kv.get(`user:${id}`))),
          Promise.all(
            uniqueUserIds.map(id => kv.get(`admin_verified:user:${id}`))
          ),
        ])
      : [[], []];
    const userMap = Object.fromEntries(
      uniqueUserIds.map((id, i) => {
        try {
          return [id, userVals[i] ? JSON.parse(userVals[i]) : null];
        } catch {
          return [id, null];
        }
      })
    );
    const userAdminVerifiedMap = Object.fromEntries(
      uniqueUserIds.map((id, i) => [id, userAdminVerifiedVals[i] === '1'])
    );

    // Step 4: compute verified synchronously
    return processed.map(
      ({
        bundle,
        packageName,
        meta,
        ownerEmail,
        hadAdminVerified,
        minRuntimeVersion,
      }) => {
        let verified = hadAdminVerified;
        const pkg = packageName || bundle.package;
        if (!verified && pkgVerifiedMap[pkg]) verified = true;
        if (!verified && ownerEmail.endsWith('@calimero.network'))
          verified = true;
        if (!verified && ownerEmail) {
          const userId = emailToUserId[ownerEmail];
          if (userId) {
            if (userMap[userId]?.verified) verified = true;
            if (!verified && userAdminVerifiedMap[userId]) verified = true;
          }
        }
        return {
          ...bundle,
          metadata: meta,
          min_runtime_version: minRuntimeVersion,
          minRuntimeVersion,
          verified,
        };
      }
    );
  };

  // V2 Bundle API endpoints

  // Handle OPTIONS requests for CORS preflight
  server.options('/api/v2/bundles', async (request, reply) => {
    return reply.code(200).send();
  });

  server.options('/api/v2/bundles/:package', async (request, reply) => {
    return reply.code(200).send();
  });

  server.options(
    '/api/v2/bundles/:package/:version',
    async (request, reply) => {
      return reply.code(200).send();
    }
  );

  // GET /api/v2/bundles - List all bundles
  server.get('/api/v2/bundles', async (request, reply) => {
    try {
      const { package: pkg, version, developer, author } = request.query || {};

      // If specific package and version requested, return single bundle
      // (Same semantics as GET /api/v2/bundles/:package/:version - also increment download count)
      if (pkg && version) {
        const bundle = await bundleStorage.getBundleManifest(pkg, version);
        if (!bundle) {
          return reply.code(404).send({
            error: 'bundle_not_found',
            message: `Bundle ${pkg}@${version} not found`,
          });
        }
        const canonicalPkg = pkg.toLowerCase();
        await Promise.all([
          kv.incr('downloads:total').catch(() => {}),
          kv.incr(`downloads:${canonicalPkg}`).catch(() => {}),
        ]);
        const normalized = await sanitizeBundle(bundle);
        normalized.downloads =
          Number(await kv.get(`downloads:${canonicalPkg}`)) || 0;
        return [normalized];
      }

      // Get all bundle packages
      const allPackages = await bundleStorage.getAllBundles();

      // Fetch bundles. When a specific package is requested, return all its
      // versions (for version history). Otherwise return only the latest
      // version per package (for the browse/list views).
      const bundles = [];
      for (const packageName of allPackages) {
        // Filter by package if specified
        if (pkg && packageName !== pkg) {
          continue;
        }

        const versions = await bundleStorage.getBundleVersions(packageName);
        if (versions.length === 0) {
          continue;
        }

        // When querying a specific package return all versions; otherwise latest only
        const versionList = pkg ? versions : [versions[0]];

        for (const ver of versionList) {
          const bundle = await bundleStorage.getBundleManifest(
            packageName,
            ver
          );

          if (!bundle) {
            continue;
          }

          // Filter by developer pubkey if specified
          if (developer) {
            const bundlePubkey = bundle.signature?.pubkey;
            if (!bundlePubkey || bundlePubkey !== developer) {
              continue;
            }
          }

          // Filter by metadata._ownerEmail (preferred) or metadata.author (legacy) — used by "My packages"
          if (author) {
            const ownerEmail =
              bundle.metadata?._ownerEmail ?? bundle.metadata?.author;
            if (!ownerEmail || ownerEmail !== author) {
              continue;
            }
          }

          bundles.push({ rawBundle: bundle, packageName });
        }
      }

      // Batch-sanitize all bundles (2 Redis rounds instead of 4N sequential)
      const normalizedBundles = await sanitizeBundles(
        bundles.map(b => ({ bundle: b.rawBundle, packageName: b.packageName }))
      );

      // Batch Redis reads for download counts (one per unique package; keys are canonical lowercase)
      const uniquePackages = [...new Set(bundles.map(b => b.packageName))];
      const downloadCounts = await Promise.all(
        uniquePackages.map(p => kv.get(`downloads:${p.toLowerCase()}`))
      );
      const countByPackage = Object.fromEntries(
        uniquePackages.map((p, i) => [p, Number(downloadCounts[i]) || 0])
      );
      const result = normalizedBundles.map((normalized, i) => {
        normalized.downloads = countByPackage[bundles[i].packageName] ?? 0;
        return normalized;
      });

      // Sort by package name
      result.sort((a, b) => a.package.localeCompare(b.package));

      return result;
    } catch (error) {
      server.log.error('Error listing bundles:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to list bundles',
      });
    }
  });

  // GET /api/v2/bundles/:package/:version - Get specific bundle
  server.get('/api/v2/bundles/:package/:version', async (request, reply) => {
    try {
      const { package: pkg, version } = request.params;

      if (!pkg || !version) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Package and version are required',
        });
      }

      const bundle = await bundleStorage.getBundleManifest(pkg, version);

      if (!bundle) {
        return reply.code(404).send({
          error: 'bundle_not_found',
          message: `Bundle ${pkg}@${version} not found`,
        });
      }

      const normalized = await sanitizeBundle(bundle);

      // Count installs: this endpoint is called exactly once per install click in the desktop app
      const canonicalPkg = pkg.toLowerCase();
      await Promise.all([
        kv.incr('downloads:total').catch(() => {}),
        kv.incr(`downloads:${canonicalPkg}`).catch(() => {}),
      ]);
      normalized.downloads =
        Number(await kv.get(`downloads:${canonicalPkg}`)) || 0;
      return normalized;
    } catch (error) {
      server.log.error('Error getting bundle:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to get bundle',
      });
    }
  });

  // PATCH /api/v2/bundles/:package/:version - Update bundle metadata (name, description, links, etc.)
  server.patch('/api/v2/bundles/:package/:version', async (request, reply) => {
    try {
      const { package: pkg, version } = request.params;

      if (!pkg || !version) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Package and version are required',
        });
      }

      // 1. Confirm the bundle exists
      const existing = await bundleStorage.getBundleManifest(pkg, version);
      if (!existing) {
        return reply.code(404).send({
          error: 'bundle_not_found',
          message: `Bundle ${pkg}@${version} not found`,
        });
      }

      const incoming = request.body;
      if (!incoming || typeof incoming !== 'object') {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Request body must be a JSON manifest object',
        });
      }

      // 2. Verify that the incoming manifest is signed and signature is valid
      const sig = normalizeSignature(incoming?.signature);
      if (!sig) {
        return reply.code(400).send({
          error: 'missing_signature',
          message:
            'Missing signature. Edits must be signed (algorithm, publicKey, signature).',
        });
      }
      try {
        await verifyManifest(incoming);
      } catch (err) {
        return reply.code(400).send({
          error: 'invalid_signature',
          message: err.message || 'Signature verification failed',
        });
      }

      // 3. Check ownership: the signer must be allowed to publish to this package
      const sessionUser = await getSessionUser(request);
      const incomingKey = getPublicKeyFromManifest(incoming);
      const allowed = await isAllowedToPublish(
        existing,
        incomingKey,
        pkg,
        sessionUser?.email
      );
      if (!allowed) {
        return reply.code(403).send({
          error: 'not_owner',
          message:
            'Only the package owner or an organization member can edit bundle metadata.',
        });
      }

      // 4. Org members (role === 'member') may only edit versions they uploaded (author === their email)
      const orgId = await getPkg2Org(pkg);
      if (orgId && sessionUser?.email) {
        const role = await getOrgMemberRole(orgId, sessionUser.email);
        if (role === 'member') {
          const versionAuthor =
            existing.metadata?._ownerEmail ?? existing.metadata?.author;
          if (versionAuthor !== sessionUser.email) {
            return reply.code(403).send({
              error: 'forbidden',
              message:
                'Organization members can only edit metadata of versions they uploaded. This version was uploaded by another user.',
            });
          }
        }
      }

      // 5. Merge: preserve immutable artifact fields from stored manifest,
      //    update only mutable fields from the incoming manifest.
      //    author is always preserved from the existing manifest — it is set
      //    from the Google session at publish time and cannot be removed or
      //    changed via edit.
      const mergedMetadata = incoming.metadata
        ? { ...incoming.metadata, author: existing.metadata?.author }
        : existing.metadata;
      const updated = {
        ...existing,
        metadata: mergedMetadata,
        links: incoming.links ?? existing.links,
        interfaces: incoming.interfaces ?? existing.interfaces,
        signature: incoming.signature,
      };

      await bundleStorage.storeBundleManifest(updated, /* overwrite= */ true);

      return reply.code(200).send({
        package: updated.package,
        version: updated.appVersion,
      });
    } catch (error) {
      server.log.error('Error patching bundle:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to update bundle',
      });
    }
  });

  // Helper: resolve session user from cookie
  async function getSessionUser(request) {
    const cookieName = config.auth?.cookieName || 'app_registry_session';
    const sessionSecret = config.auth?.sessionSecret;
    const token = request.cookies?.[cookieName];
    if (!sessionSecret || !token) return null;
    try {
      return await verifySessionToken(token, sessionSecret);
    } catch {
      return null;
    }
  }

  /**
   * Resolve the current user from session cookie or Bearer token.
   * Returns { email, name, username } or null.
   */
  async function resolveAuthUser(request) {
    // Try session cookie first
    const sessionUser = await getSessionUser(request);
    if (sessionUser?.email) {
      const profile = await getUserByEmail(sessionUser.email);
      return {
        email: sessionUser.email,
        name: sessionUser.name,
        username: profile?.username ?? null,
      };
    }
    // Try Bearer token
    const auth = request.headers?.['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const tokenData = await verifyApiToken(auth.slice(7));
      if (tokenData?.email) {
        const profile = await getUserByEmail(tokenData.email);
        return {
          email: tokenData.email,
          name: tokenData.name,
          username: profile?.username ?? null,
        };
      }
    }
    return null;
  }

  // DELETE /api/v2/bundles/:package/:version - Delete a specific version
  server.delete('/api/v2/bundles/:package/:version', async (request, reply) => {
    try {
      const { package: pkg, version } = request.params;

      const user = await getSessionUser(request);
      if (!user?.email) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'Login required to delete bundles.',
        });
      }

      const existing = await bundleStorage.getBundleManifest(pkg, version);
      if (!existing) {
        return reply.code(404).send({
          error: 'bundle_not_found',
          message: `Bundle ${pkg}@${version} not found`,
        });
      }

      const ownerEmail =
        existing.metadata?._ownerEmail ?? existing.metadata?.author;
      if (!ownerEmail || ownerEmail !== user.email) {
        return reply.code(403).send({
          error: 'not_owner',
          message: 'Only the package author can delete this version.',
        });
      }

      await bundleStorage.deleteBundleVersion(pkg, version);
      return reply.code(200).send({ message: `Deleted ${pkg}@${version}` });
    } catch (error) {
      server.log.error('Error deleting bundle version:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to delete bundle version',
      });
    }
  });

  // DELETE /api/v2/bundles/:package - Delete an entire package (all versions)
  server.delete('/api/v2/bundles/:package', async (request, reply) => {
    try {
      const { package: pkg } = request.params;

      const user = await getSessionUser(request);
      if (!user?.email) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'Login required to delete packages.',
        });
      }

      const versions = await bundleStorage.getBundleVersions(pkg);
      if (versions.length === 0) {
        return reply.code(404).send({
          error: 'package_not_found',
          message: `Package ${pkg} not found`,
        });
      }

      // Check ownership from the latest version
      const latest = await bundleStorage.getBundleManifest(pkg, versions[0]);
      const ownerEmail =
        latest?.metadata?._ownerEmail ?? latest?.metadata?.author;
      if (!ownerEmail || ownerEmail !== user.email) {
        return reply.code(403).send({
          error: 'not_owner',
          message: 'Only the package author can delete this package.',
        });
      }

      await bundleStorage.deletePackage(pkg);
      return reply.code(200).send({ message: `Deleted package ${pkg}` });
    } catch (error) {
      server.log.error('Error deleting package:', error);
      return reply.code(500).send({
        error: 'internal_server_error',
        message: error.message || 'Failed to delete package',
      });
    }
  });

  // Shared: validate manifest, verify signature, check ownership, store. Returns { package, appVersion } or throws { statusCode, body }.
  async function processPushBody(bundleManifest, { userEmail, username } = {}) {
    if (
      !bundleManifest ||
      bundleManifest === null ||
      bundleManifest === undefined
    ) {
      throw {
        statusCode: 400,
        body: { error: 'invalid_manifest', message: 'Missing body' },
      };
    }
    if (!bundleManifest.package || !bundleManifest.appVersion) {
      throw {
        statusCode: 400,
        body: {
          error: 'invalid_manifest',
          message: 'Missing required fields: package, appVersion',
        },
      };
    }
    const sig = normalizeSignature(bundleManifest?.signature);
    if (!sig) {
      throw {
        statusCode: 400,
        body: {
          error: 'missing_signature',
          message:
            'Missing signature. All publishes require a valid signature (algorithm, publicKey, signature).',
        },
      };
    }
    server.log.info('[push-file] Verifying manifest signature');
    try {
      await verifyManifest(bundleManifest);
      server.log.info('[push-file] Signature valid');
    } catch (error) {
      server.log.warn(
        { err: error },
        '[push-file] Signature invalid: %s',
        error?.message ?? error
      );
      throw {
        statusCode: 400,
        body: {
          error: 'invalid_signature',
          message: error.message || 'Signature verification failed',
        },
      };
    }
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await bundleStorage.getBundleVersions(
      bundleManifest.package
    );
    // Set or preserve author: only set from session when creating a new package; never overwrite on new version.
    // Author is locked from the oldest (first) version, not the latest.
    // We store: metadata.author = username (display), metadata._ownerEmail = email (ownership checks).
    bundleManifest.metadata = bundleManifest.metadata || {};
    const displayAuthor = username || userEmail; // prefer username, fall back to email
    if (versions.length > 0) {
      const oldestVersion = versions[versions.length - 1];
      const latestVersion = versions[0];
      const manifestOldest = await bundleStorage.getBundleManifest(
        bundleManifest.package,
        oldestVersion
      );
      const existingAuthor = manifestOldest?.metadata?.author;
      if (existingAuthor) {
        bundleManifest.metadata.author = existingAuthor;
        // Preserve _ownerEmail from oldest manifest if present
        if (manifestOldest?.metadata?._ownerEmail) {
          bundleManifest.metadata._ownerEmail =
            manifestOldest.metadata._ownerEmail;
        }
      } else if (displayAuthor) {
        bundleManifest.metadata.author = displayAuthor;
        if (userEmail) bundleManifest.metadata._ownerEmail = userEmail;
      }
      const manifestLatest = await bundleStorage.getBundleManifest(
        bundleManifest.package,
        latestVersion
      );
      const allowed = await isAllowedToPublish(
        manifestLatest,
        incomingKey,
        bundleManifest.package,
        userEmail
      );
      if (!allowed) {
        throw {
          statusCode: 403,
          body: {
            error: 'not_owner',
            message:
              'Only the package owner (signer or a key in manifest.owners) or an organization member can publish new versions.',
          },
        };
      }
      // Reject if new version is not greater than latest
      const latest = latestVersion;
      const incoming = bundleManifest.appVersion;
      if (
        semver.valid(incoming) &&
        semver.valid(latest) &&
        semver.lte(incoming, latest)
      ) {
        throw {
          statusCode: 400,
          body: {
            error: 'version_not_allowed',
            message: `New version (${incoming}) must be greater than latest (${latest}).`,
          },
        };
      }
    } else if (displayAuthor) {
      bundleManifest.metadata.author = displayAuthor;
      if (userEmail) bundleManifest.metadata._ownerEmail = userEmail;
    }
    const overwrite =
      process.env.ALLOW_BUNDLE_OVERWRITE === 'true' ||
      process.env.ALLOW_BUNDLE_OVERWRITE === '1';
    await bundleStorage.storeBundleManifest(bundleManifest, overwrite);
    return {
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    };
  }

  function findManifest(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === 'manifest.json') return full;
      if (e.isDirectory()) {
        const r = findManifest(full);
        if (r) return r;
      }
    }
    return null;
  }

  // POST /api/v2/bundles/push - Push a new bundle (used by CLI)
  const pushBundleHandler = async (request, reply) => {
    try {
      const authUser = await resolveAuthUser(request);
      const result = await processPushBody(request.body, {
        userEmail: authUser?.email,
        username: authUser?.username,
      });
      return reply.code(201).send({
        message: 'Bundle published successfully',
        package: result.package,
        version: result.version,
      });
    } catch (err) {
      if (err && typeof err.statusCode === 'number' && err.body) {
        return reply.code(err.statusCode).send(err.body);
      }
      server.log.error('Error pushing bundle:', err);
      return reply.code(500).send({
        error: 'internal_error',
        message: err?.message ?? String(err),
      });
    }
  };

  server.post('/api/v2/bundles/push', pushBundleHandler);
  server.options('/api/v2/bundles/push', async (_req, reply) =>
    reply.code(200).send()
  );

  // POST /api/v2/bundles/push-file - Push a bundle from .mpk file (used by frontend)
  server.post('/api/v2/bundles/push-file', async (request, reply) => {
    server.log.info('[push-file] Request received');
    let tempDir;
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Missing file. Upload a .mpk file in field "bundle".',
        });
      }
      const buffer = await data.toBuffer();
      const filename = data.filename || '';
      if (!filename.toLowerCase().endsWith('.mpk')) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'File must be a .mpk bundle.',
        });
      }

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-push-'));
      const mpkPath = path.join(tempDir, 'bundle.mpk');
      fs.writeFileSync(mpkPath, buffer);

      await tar.x({
        file: mpkPath,
        gzip: true,
        cwd: tempDir,
        filter: name => path.basename(name) === 'manifest.json',
      });
      const manifestPath = findManifest(tempDir);
      if (!manifestPath) {
        return reply.code(400).send({
          error: 'invalid_bundle',
          message: 'Bundle must contain manifest.json.',
        });
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const body = {
        ...manifest,
        _binary: buffer.toString('hex'),
        _overwrite: true,
      };

      const authUser = await resolveAuthUser(request);
      const result = await processPushBody(body, {
        userEmail: authUser?.email,
        username: authUser?.username,
      });
      return reply.code(201).send({
        message: 'Bundle published successfully',
        package: result.package,
        version: result.version,
      });
    } catch (err) {
      if (err && typeof err.statusCode === 'number' && err.body) {
        return reply.code(err.statusCode).send(err.body);
      }
      server.log.error('Error push-file:', err);
      return reply.code(500).send({
        error: 'internal_error',
        message: err?.message ?? String(err),
      });
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true });
        } catch (e) {
          server.log.warn('Cleanup temp dir failed:', e);
        }
      }
    }
  });

  // Serve artifacts (WASM, MPK, etc.)
  // Supports both flat structure (/artifacts/:filename) and nested structure (/artifacts/:package/:version/:filename)
  server.get('/artifacts/*', async (request, reply) => {
    const artifactPath = request.params['*']; // Get the full path after /artifacts/
    const artifactsDir = path.join(__dirname, '../artifacts');
    const filePath = path.join(artifactsDir, artifactPath);

    // Security: only allow files in artifacts directory
    // Use path.sep to prevent path traversal to sibling directories (e.g., artifacts-private)
    const resolvedPath = path.resolve(filePath);
    const resolvedArtifactsDir = path.resolve(artifactsDir);
    const artifactsDirWithSep = resolvedArtifactsDir + path.sep;
    if (
      !resolvedPath.startsWith(artifactsDirWithSep) &&
      resolvedPath !== resolvedArtifactsDir
    ) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        error: 'not_found',
        message: `Artifact ${artifactPath} not found`,
      });
    }

    // Count download: path is package/version/filename (e.g. com.calimero.kvstore/1.0.0/pkg-1.0.0.mpk)
    const pathParts = artifactPath.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      const pkg = pathParts[0];
      const canonicalPkg = pkg.toLowerCase();
      try {
        await Promise.all([
          kv.incr('downloads:total'),
          kv.incr(`downloads:${canonicalPkg}`),
        ]);
        request.log.info(
          { pkg, artifactPath },
          'download counted (artifact requested)'
        );
      } catch (e) {
        request.log.warn({ err: e, pkg }, 'download count incr failed');
      }
    }

    // Read and send the file
    try {
      const fileContent = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Set appropriate Content-Type based on file extension
      let contentType = 'application/octet-stream';
      if (ext === '.wasm') {
        contentType = 'application/wasm';
      } else if (ext === '.mpk') {
        contentType = 'application/zip'; // MPK files are ZIP archives
      }

      reply.header('Content-Type', contentType);
      reply.header(
        'Content-Disposition',
        `attachment; filename="${path.basename(filePath)}"`
      );
      reply.header('Content-Length', fileContent.length);

      return reply.send(fileContent);
    } catch (error) {
      return reply.code(500).send({
        error: 'internal_error',
        message: `Failed to read artifact: ${error.message}`,
      });
    }
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    const port = process.env.PORT || 8080;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    server.log.info(`Server listening on ${host}:${port}`);
    server.log.info(
      `API documentation available at http://${host}:${port}/docs`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
