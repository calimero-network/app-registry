import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { LocalConfig } from './local-config.js';
import { LocalDataStore, AppSummary, AppManifest } from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
import path from 'path';
import fs from 'fs';

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

    // Apps endpoints
    this.server.get('/apps', async request => {
      const query = request.query as { dev?: string; name?: string };
      return this.dataStore.getApps(query);
    });

    this.server.get('/apps/:appId', async request => {
      const { appId } = request.params as { appId: string };
      return this.dataStore.getAppVersions(appId);
    });

    this.server.get('/apps/:appId/:semver', async request => {
      const { appId, semver } = request.params as {
        appId: string;
        semver: string;
      };
      const manifest = this.dataStore.getManifest(appId, semver);

      if (!manifest) {
        throw this.server.httpErrors.notFound('Manifest not found');
      }

      // Update artifacts to use local URLs
      return this.artifactServer.updateManifestArtifacts(manifest);
    });

    this.server.post('/apps', async request => {
      const manifest = request.body as AppManifest;

      // Validate manifest structure
      if (!this.validateManifest(manifest)) {
        throw this.server.httpErrors.badRequest('Invalid manifest structure');
      }

      // Process artifacts - copy to local storage
      const processedManifest = await this.processManifestArtifacts(manifest);

      // Store manifest
      const manifestKey = `${manifest.app.developer_pubkey}/${manifest.app.name}/${manifest.version.semver}`;
      this.dataStore.setManifest(manifestKey, processedManifest);

      // Update app summary
      const appKey = `${manifest.app.developer_pubkey}/${manifest.app.name}`;
      const appSummary: AppSummary = {
        name: manifest.app.name,
        developer_pubkey: manifest.app.developer_pubkey,
        latest_version: manifest.version.semver,
        latest_cid: manifest.artifacts[0]?.cid || '',
        alias: manifest.app.alias,
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

          return artifactData;
        } catch {
          throw this.server.httpErrors.notFound('Artifact not found');
        }
      }
    );

    this.server.get('/artifacts/:hash', async (request, reply) => {
      const { hash } = request.params as { hash: string };

      try {
        const artifactData = await this.artifactServer.serveByHash(hash);

        // Set appropriate headers
        reply.header('Content-Type', 'application/octet-stream');

        return artifactData;
      } catch {
        throw this.server.httpErrors.notFound('Artifact not found');
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
  }

  private validateManifest(manifest: AppManifest): boolean {
    // Basic validation - in production, use proper schema validation
    return !!(
      manifest.manifest_version &&
      manifest.app &&
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

    if (processedManifest.artifacts) {
      processedManifest.artifacts = await Promise.all(
        processedManifest.artifacts.map(async artifact => {
          const processedArtifact = { ...artifact };

          // If artifact has a local path, copy it to local storage
          if (artifact.path && fs.existsSync(artifact.path)) {
            const filename = path.basename(artifact.path);
            const appId = manifest.app.id || manifest.app.name;

            try {
              await this.artifactServer.copyArtifactToLocal(
                artifact.path,
                appId,
                manifest.version.semver,
                filename
              );

              // Update artifact to use local URL
              processedArtifact.mirrors = [
                this.artifactServer.getArtifactUrl(
                  appId,
                  manifest.version.semver,
                  filename
                ),
              ];

              // Remove local path for production compatibility
              delete processedArtifact.path;
            } catch (error) {
              console.warn(`Failed to copy artifact ${artifact.path}:`, error);
            }
          }

          return processedArtifact;
        })
      );
    }

    return processedManifest;
  }
}
