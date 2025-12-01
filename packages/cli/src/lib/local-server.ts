import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { LocalConfig } from './local-config.js';
import { LocalDataStore, AppSummary, V1Manifest } from './local-storage.js';
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

    // V2 Bundle API endpoints
    this.server.get(
      '/api/v2/bundles/:package/:version',
      async (request, reply) => {
        const { package: pkg, version } = request.params as {
          package: string;
          version: string;
        };

        const manifest = this.dataStore.getBundleManifest(pkg, version);

        if (!manifest) {
          return reply.code(404).send({
            error: 'manifest_not_found',
            message: `Manifest not found for ${pkg}@${version}`,
          });
        }

        return manifest;
      }
    );

    // V1 API endpoints
    this.server.post('/v1/apps', async (request, reply) => {
      const manifest = request.body as V1Manifest;

      if (!this.validateV1Manifest(manifest)) {
        return reply.code(400).send({
          error: 'invalid_schema',
          details: 'Missing required fields',
        });
      }

      try {
        const processedManifest = await this.processManifestArtifacts(manifest);
        const manifestKey = `${processedManifest.id}/${processedManifest.version}`;
        this.dataStore.setManifest(manifestKey, processedManifest);

        const summary: AppSummary = {
          id: processedManifest.id,
          name: processedManifest.name,
          latest_version: processedManifest.version,
          latest_digest: processedManifest.artifact.digest,
        };
        this.dataStore.setApp(processedManifest.id, summary);

        return reply.code(201).send({
          id: processedManifest.id,
          version: processedManifest.version,
          canonical_uri: `/v1/apps/${processedManifest.id}/${processedManifest.version}`,
        });
      } catch (error) {
        return reply.code(409).send({
          error: 'already_exists',
          details: `${manifest.id}@${manifest.version} - ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      const manifestWithArtifact =
        this.artifactServer.updateManifestArtifact(oldManifest);

      if (canonical === 'true') {
        const canonicalJCS = JSON.stringify(
          manifestWithArtifact,
          Object.keys(manifestWithArtifact).sort()
        );
        return {
          canonical_jcs: Buffer.from(canonicalJCS, 'utf8').toString('base64'),
        };
      }

      return manifestWithArtifact;
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

  private validateV1Manifest(manifest: V1Manifest): boolean {
    return !!(
      manifest &&
      manifest.manifest_version &&
      manifest.id &&
      manifest.name &&
      manifest.version &&
      manifest.artifact &&
      manifest.artifact.type &&
      manifest.artifact.target &&
      manifest.artifact.digest &&
      manifest.artifact.uri
    );
  }

  private async processManifestArtifacts(
    manifest: V1Manifest
  ): Promise<V1Manifest> {
    const processedManifest: V1Manifest = { ...manifest };

    if (manifest.artifact?.uri?.startsWith('file://')) {
      const filePath = manifest.artifact.uri.replace('file://', '');

      if (fs.existsSync(filePath)) {
        const filename = path.basename(filePath);

        try {
          await this.artifactServer.copyArtifactToLocal(
            filePath,
            manifest.id,
            manifest.version,
            filename
          );

          processedManifest.artifact = {
            ...manifest.artifact,
            uri: this.artifactServer.getArtifactUrl(
              manifest.id,
              manifest.version,
              filename
            ),
          };
        } catch (error) {
          console.warn(`Failed to copy artifact ${filePath}:`, error);
        }
      }
    }

    return processedManifest;
  }
}
