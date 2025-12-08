import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { LocalConfig } from './local-config.js';
import { LocalDataStore, BundleManifest } from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
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
    this.server.get('/api/v2/bundles', async (request, reply) => {
      const query = request.query as {
        package?: string;
        version?: string;
        developer?: string;
      };

      const { package: pkg, version, developer } = query;

      // If specific package and version requested, return single bundle
      if (pkg && version) {
        const manifest = this.dataStore.getBundleManifest(pkg, version);
        if (!manifest) {
          return reply.code(404).send({
            error: 'bundle_not_found',
            message: `Bundle ${pkg}@${version} not found`,
          });
        }
        return [manifest];
      }

      // Get all bundles
      const allBundles = this.dataStore.getAllBundles();
      const bundles = [];

      for (const bundle of allBundles) {
        // Filter by package if specified
        if (pkg && bundle.package !== pkg) {
          continue;
        }

        // Filter by developer pubkey if specified
        if (developer) {
          const bundlePubkey = bundle.signature?.pubkey;
          if (!bundlePubkey || bundlePubkey !== developer) {
            continue;
          }
        }

        bundles.push(bundle);
      }

      // Sort by package name, then by version (descending)
      bundles.sort((a, b) => {
        const pkgCompare = a.package.localeCompare(b.package);
        if (pkgCompare !== 0) return pkgCompare;
        // For same package, sort by version descending
        return b.appVersion.localeCompare(a.appVersion, undefined, {
          numeric: true,
        });
      });

      // If filtering by package, return all versions
      // Otherwise, return only latest version per package
      if (pkg) {
        return bundles;
      }

      // Group by package and return only latest version
      const latestByPackage = new Map<string, BundleManifest>();
      for (const bundle of bundles) {
        const existing = latestByPackage.get(bundle.package);
        if (!existing || bundle.appVersion > existing.appVersion) {
          latestByPackage.set(bundle.package, bundle);
        }
      }

      return Array.from(latestByPackage.values());
    });

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
  }
}
