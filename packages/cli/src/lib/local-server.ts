import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { LocalConfig } from './local-config.js';
import { LocalDataStore, AppSummary, AppManifest } from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
import path from 'path';
import fs from 'fs';
import { Buffer } from 'buffer';

export interface ServerStatus {
  running: boolean;
  url: string;
  dataDir: string;
  appsCount: number;
  artifactsCount: number;
}

export class LocalRegistryServer {
  private config: LocalConfig;
  private dataStore: LocalDataStore;
  private artifactServer: LocalArtifactServer;
  private server: FastifyInstance | null = null;
  private isRunning = false;

  constructor(config: LocalConfig) {
    this.config = config;
    this.dataStore = new LocalDataStore(config);
    this.artifactServer = new LocalArtifactServer(config, this.dataStore);
  }

  async start(port?: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('Local registry is already running');
    }

    const serverPort = port || this.config.getPort();
    const host = this.config.getHost();

    // Ensure directories exist
    this.config.ensureDirectories();

    // Create Fastify server
    this.server = fastify({
      logger: {
        level: 'info',
      },
    });

    // Register CORS
    await this.server.register(cors, {
      origin: true,
      credentials: true,
    });

    // Register routes
    await this.registerRoutes();

    // Start server
    await this.server.listen({ port: serverPort, host });
    this.isRunning = true;

    console.log(
      `Local registry server started on http://${host}:${serverPort}`
    );
  }

  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      throw new Error('Local registry is not running');
    }

    await this.server.close();
    this.isRunning = false;
    this.server = null;
  }

  async getStatus(): Promise<ServerStatus> {
    const stats = this.dataStore.getStats();
    const artifactStats = this.artifactServer.getArtifactStats();

    return {
      running: this.isRunning,
      url: `http://${this.config.getHost()}:${this.config.getPort()}`,
      dataDir: this.config.getDataDir(),
      appsCount: stats.publishedApps,
      artifactsCount: artifactStats.totalFiles,
    };
  }

  async reset(): Promise<void> {
    this.dataStore.reset();

    // Clean up artifacts directory
    const artifactsDir = this.config.getArtifactsDir();
    if (fs.existsSync(artifactsDir)) {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  }

  async backup(outputPath?: string): Promise<string> {
    return await this.dataStore.backup(outputPath);
  }

  async restore(backupPath: string): Promise<void> {
    await this.dataStore.restore(backupPath);
  }

  async seed(): Promise<void> {
    await this.dataStore.seed();
  }

  private async registerRoutes(): Promise<void> {
    if (!this.server) {
      throw new Error('Server not initialized');
    }

    // Health endpoint
    this.server.get('/healthz', async () => {
      return { status: 'ok' };
    });

    // Statistics endpoint
    this.server.get('/stats', async () => {
      const stats = this.dataStore.getStats();
      const artifactStats = this.artifactServer.getArtifactStats();

      return {
        publishedApps: stats.publishedApps,
        totalVersions: stats.totalVersions,
        totalArtifacts: artifactStats.totalFiles,
        totalSize: artifactStats.totalSize,
      };
    });

    // Apps endpoints (support both path and query parameter formats)
    this.server.get('/apps', async request => {
      const query = request.query as {
        dev?: string;
        name?: string;
        id?: string;
        versions?: string;
        version?: string;
      };

      // Handle Vercel-style query parameters
      if (query.id && query.versions === 'true') {
        // GET /apps?id=xxx&versions=true (Vercel format)
        return {
          id: query.id,
          versions: this.dataStore.getAppVersions(query.id),
        };
      }

      if (query.id && query.version) {
        // GET /apps?id=xxx&version=yyy (Vercel format)
        const manifest = this.dataStore.getManifest(query.id, query.version);
        if (!manifest) {
          return {
            statusCode: 404,
            error: 'Not Found',
            message: 'Manifest not found',
          };
        }
        return this.artifactServer.updateManifestArtifacts(manifest);
      }

      // Default: list all apps
      return this.dataStore.getApps(query);
    });

    this.server.get('/apps/:appId', async request => {
      const { appId } = request.params as { appId: string };
      const versions = this.dataStore.getAppVersions(appId);
      return {
        id: appId,
        versions: versions,
      };
    });

    this.server.get('/apps/:appId/:semver', async request => {
      const { appId, semver } = request.params as {
        appId: string;
        semver: string;
      };
      const manifest = this.dataStore.getManifest(appId, semver);

      if (!manifest) {
        return {
          statusCode: 404,
          error: 'Not Found',
          message: 'Manifest not found',
        };
      }

      // Update artifacts to use local URLs
      return this.artifactServer.updateManifestArtifacts(manifest);
    });

    this.server.post('/apps', async request => {
      const manifest = request.body as AppManifest;

      // Validate manifest structure
      if (!this.validateManifest(manifest)) {
        return {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid manifest structure',
        };
      }

      // Process artifacts - copy to local storage
      const processedManifest = await this.processManifestArtifacts(manifest);

      // Store manifest
      const manifestKey = `${manifest.app.app_id}/${manifest.version.semver}`;
      this.dataStore.setManifest(manifestKey, processedManifest);

      // Update app summary
      const appKey = manifest.app.app_id;
      const appSummary: AppSummary = {
        name: manifest.app.name,
        developer_pubkey: manifest.app.developer_pubkey,
        latest_version: manifest.version.semver,
        latest_cid: manifest.artifacts[0]?.cid || '',
        alias: manifest.app.name, // Use name as alias
      };
      this.dataStore.setApp(appKey, appSummary);

      return {
        success: true,
        message: 'App version registered successfully',
        manifest_key: manifestKey,
      };
    });

    // Artifact endpoints
    this.server.get(
      '/artifacts/:appId/:version/:filename',
      async (request, reply) => {
        const { appId, version, filename } = request.params as {
          appId: string;
          version: string;
          filename: string;
        };

        try {
          const artifactData = await this.artifactServer.serveArtifact(
            appId,
            version,
            filename
          );

          // Set appropriate headers
          reply.header('Content-Type', 'application/octet-stream');
          reply.header(
            'Content-Disposition',
            `attachment; filename="${filename}"`
          );

          return artifactData as Uint8Array;
        } catch {
          return {
            statusCode: 404,
            error: 'Not Found',
            message: 'Artifact not found',
          };
        }
      }
    );

    this.server.get('/artifacts/:hash', async (request, reply) => {
      const { hash } = request.params as { hash: string };

      try {
        const artifactData = await this.artifactServer.serveByHash(hash);

        // Set appropriate headers
        reply.header('Content-Type', 'application/octet-stream');

        return artifactData as Uint8Array;
      } catch {
        return {
          statusCode: 404,
          error: 'Not Found',
          message: 'Artifact not found',
        };
      }
    });

    // Local registry management endpoints
    this.server.get('/local/status', async () => {
      return await this.getStatus();
    });

    this.server.post('/local/reset', async () => {
      await this.reset();
      return { message: 'Local registry data reset successfully' };
    });

    this.server.get('/local/backup', async request => {
      const query = request.query as { output?: string };
      const backupPath = await this.backup(query.output);
      return { backupPath };
    });

    this.server.post('/local/restore', async request => {
      const { backupPath } = request.body as { backupPath: string };
      await this.restore(backupPath);
      return { message: 'Data restored successfully' };
    });

    this.server.post('/local/seed', async () => {
      await this.seed();
      return { message: 'Sample data seeded successfully' };
    });

    // V1 API endpoints
    this.server.post('/v1/apps', async (request, reply) => {
      const manifest = request.body as Record<string, unknown>;

      // Basic validation
      if (
        !manifest.manifest_version ||
        !manifest.id ||
        !manifest.name ||
        !manifest.version
      ) {
        return reply.code(400).send({
          error: 'invalid_schema',
          details: 'Missing required fields',
        });
      }

      try {
        // Process artifacts - copy to local storage
        const processedManifest = await this.processManifestArtifacts(manifest);

        // Store manifest directly (no conversion needed)
        const manifestKey = `${manifest.id}/${manifest.version}`;
        this.dataStore.setManifest(manifestKey, processedManifest);

        // Create app summary
        const appKey = manifest.id;
        const appSummary = {
          id: manifest.id,
          name: manifest.name,
          developer_pubkey: 'local-dev-key',
          latest_version: manifest.version,
          latest_cid: manifest.artifact?.digest || '',
        };
        this.dataStore.setApp(appKey, appSummary);

        return reply.code(201).send({
          id: manifest.id,
          version: manifest.version,
          canonical_uri: `/v1/apps/${manifest.id}/${manifest.version}`,
        });
      } catch {
        return reply.code(409).send({
          error: 'already_exists',
          details: `${manifest.id}@${manifest.version}`,
        });
      }
    });

    this.server.get('/v1/apps/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const versions = this.dataStore.getAppVersions(id);

      if (!versions || versions.length === 0) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'App not found' });
      }

      return {
        id,
        versions: versions.map(v => v.semver),
      };
    });

    this.server.get('/v1/apps/:id/:version', async (request, reply) => {
      const { id, version } = request.params as { id: string; version: string };
      const { canonical } = request.query as { canonical?: string };

      const oldManifest = this.dataStore.getManifest(id, version);
      if (!oldManifest) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Manifest not found' });
      }

      // Convert old format to V1 format
      const v1Manifest = {
        manifest_version: oldManifest.manifest_version,
        id: oldManifest.app.app_id,
        name: oldManifest.app.name,
        version: oldManifest.version.semver,
        chains: oldManifest.supported_chains,
        artifact: oldManifest.artifacts[0]
          ? {
              type: oldManifest.artifacts[0].type,
              target: oldManifest.artifacts[0].target,
              digest:
                oldManifest.artifacts[0].cid || `sha256:${'0'.repeat(64)}`,
              uri:
                oldManifest.artifacts[0].path ||
                oldManifest.artifacts[0].mirrors?.[0] ||
                'https://example.com/artifact',
            }
          : {
              type: 'wasm',
              target: 'node',
              digest: `sha256:${'0'.repeat(64)}`,
              uri: 'https://example.com/artifact',
            },
        _warnings: [],
      };

      if (canonical === 'true') {
        // Return canonical JCS format
        const canonicalJCS = JSON.stringify(
          v1Manifest,
          Object.keys(v1Manifest).sort()
        );
        return {
          canonical_jcs: Buffer.from(canonicalJCS, 'utf8').toString('base64'),
        };
      }

      return v1Manifest;
    });

    this.server.get('/v1/search', async (request, reply) => {
      const { q } = request.query as { q?: string };

      if (!q) {
        return reply.code(400).send({
          error: 'bad_request',
          message: 'Query parameter "q" is required',
        });
      }

      // Simple search implementation
      const apps = this.dataStore.getApps({});
      const results = apps.filter(
        app =>
          app.name.toLowerCase().includes(q.toLowerCase()) ||
          (app as { id?: string }).id?.toLowerCase().includes(q.toLowerCase())
      );

      return results.map(app => ({
        id: app.id || app.name,
        versions: [app.latest_version],
      }));
    });

    this.server.post('/v1/resolve', async (request, reply) => {
      const { root } = request.body as {
        root: { id: string; version: string };
        installed?: Array<{ id: string; version: string }>;
      };

      if (!root || !root.id || !root.version) {
        return reply.code(400).send({
          error: 'bad_request',
          message: 'Root app ID and version are required',
        });
      }

      // Simple resolution - just return the root app for now
      return {
        plan: [{ action: 'install', id: root.id, version: root.version }],
        satisfies: [],
        missing: [],
      };
    });
  }

  private validateManifest(manifest: AppManifest): boolean {
    // Basic validation - in production, use proper schema validation
    return !!(
      manifest.manifest_version &&
      manifest.app &&
      manifest.app.app_id &&
      manifest.app.name &&
      manifest.app.developer_pubkey &&
      manifest.version &&
      manifest.version.semver &&
      manifest.artifacts &&
      manifest.artifacts.length > 0
    );
  }

  private async processManifestArtifacts(
    manifest: AppManifest
  ): Promise<AppManifest> {
    const processedManifest = { ...manifest };

    // Handle V1 manifest format (single artifact object)
    if (manifest.artifact && manifest.artifact.uri) {
      const artifact = manifest.artifact;

      // Check if it's a file:// URI
      if (artifact.uri.startsWith('file://')) {
        const filePath = artifact.uri.replace('file://', '');

        if (fs.existsSync(filePath)) {
          const filename = path.basename(filePath);
          const appId = manifest.id;

          try {
            await this.artifactServer.copyArtifactToLocal(
              filePath,
              appId,
              manifest.version,
              filename
            );

            // Update artifact URI to use local URL
            processedManifest.artifact = {
              ...artifact,
              uri: this.artifactServer.getArtifactUrl(
                appId,
                manifest.version,
                filename
              ),
            };
          } catch (error) {
            console.warn(`Failed to copy artifact ${filePath}:`, error);
          }
        }
      }
    }

    return processedManifest;
  }
}
