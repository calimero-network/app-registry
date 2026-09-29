import fastify, { FastifyInstance } from 'fastify';
import { LocalConfig } from './local-config.js';
import { LocalDataStore, BundleManifest } from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
import fs from 'fs';
import path from 'path';

export interface ServerStatus {
  running: boolean;
  url: string;
  dataDir: string;
  appsCount: number;
  artifactsCount: number;
}

/**
 * True when `origin` is an http(s) origin whose host is loopback or one of the
 * hosts this server is configured to answer on. `Origin: null` (sandboxed
 * iframes, file://, some redirects) is never allowed.
 */
function isAllowedOrigin(origin: string, allowedHosts: Set<string>): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return allowedHosts.has(parsed.hostname.toLowerCase());
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

    // Hardening: no CORS reflection. This is a local dev server and needs no
    // cross-origin browser access; reflecting every Origin with credentials
    // let any website read responses from a developer's machine.

    // Hardening (anti DNS-rebinding): only accept requests whose Host header
    // names a host we serve on. Even bound to loopback, a malicious website can
    // point a domain it controls at 127.0.0.1 and reach us from the browser;
    // rejecting unexpected Host headers stops that. Loopback names are always
    // allowed; the configured bind/public host is allowed for the Docker case.
    const allowedHosts = new Set<string>();
    for (const name of [
      'localhost',
      '127.0.0.1',
      '[::1]',
      this.config.getPublicHost(),
      host === '0.0.0.0' || host === '::' ? '' : host,
    ]) {
      if (!name) continue;
      allowedHosts.add(name);
      allowedHosts.add(`${name}:${serverPort}`);
    }
    this.server.addHook('onRequest', async (request, reply) => {
      const hostHeader = (request.headers.host ?? '').toLowerCase();
      if (!allowedHosts.has(hostHeader)) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Invalid Host header',
        });
      }
    });

    // Only same-origin or non-browser callers may use state-changing methods.
    // A browser page on another site can still send "simple" cross-origin
    // POSTs (no preflight), so check the browser-supplied Origin and
    // Sec-Fetch-Site headers; the CLI and curl send neither.
    const allowedOriginHosts = new Set<string>();
    for (const name of allowedHosts) {
      allowedOriginHosts.add(name.replace(/:\d+$/, ''));
    }
    this.server.addHook('onRequest', async (request, reply) => {
      const method = request.method.toUpperCase();
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return;
      }
      const origin = request.headers.origin;
      if (
        origin !== undefined &&
        !isAllowedOrigin(origin, allowedOriginHosts)
      ) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Cross-origin request not allowed',
        });
      }
      const fetchSite = request.headers['sec-fetch-site'];
      if (
        fetchSite !== undefined &&
        fetchSite !== 'same-origin' &&
        fetchSite !== 'none'
      ) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Cross-site request not allowed',
        });
      }
      // The /local/* management routes take JSON only. Requiring the JSON
      // content type means a browser cannot reach them without a CORS
      // preflight, which this server never answers.
      const pathname = request.url.split('?')[0];
      if (pathname.startsWith('/local/')) {
        const contentType = String(request.headers['content-type'] ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (contentType !== 'application/json') {
          return reply.code(415).send({
            statusCode: 415,
            error: 'Unsupported Media Type',
            message: 'Content-Type must be application/json',
          });
        }
      }
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

  /**
   * Hardening: resolve a caller-supplied backup path relative to the CLI data
   * dir and verify it stays inside it. Rejects absolute paths and `..` segments
   * that would escape, so the HTTP backup/restore routes cannot read or write
   * arbitrary filesystem locations.
   */
  private confineToDataDir(candidate: string): string {
    const dataDir = path.resolve(this.config.getDataDir());
    const resolved = path.resolve(dataDir, candidate);
    if (resolved !== dataDir && !resolved.startsWith(dataDir + path.sep)) {
      throw new Error('Path escapes data directory');
    }
    return resolved;
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

    // Hardening: reset/backup/restore mutate or exfiltrate data, so they are
    // POST-only — a GET could be triggered by a plain <img> or a navigation.
    this.server.post('/local/reset', async () => {
      await this.reset();
      return { message: 'Local registry data reset successfully' };
    });

    this.server.post('/local/backup', async (request, reply) => {
      const query = request.query as { output?: string };
      let output: string | undefined;
      if (query.output) {
        // Hardening: keep a caller-supplied output path inside the data dir so
        // a request cannot write a file to an arbitrary filesystem location.
        try {
          output = this.confineToDataDir(query.output);
        } catch {
          return reply.code(400).send({
            error: 'invalid_path',
            message: 'output escapes data dir',
          });
        }
      }
      const backupPath = await this.backup(output);
      return { backupPath };
    });

    this.server.post('/local/restore', async (request, reply) => {
      const { backupPath } = (request.body ?? {}) as { backupPath?: string };
      if (!backupPath) {
        return reply
          .code(400)
          .send({ error: 'invalid_path', message: 'backupPath is required' });
      }
      // Hardening: only restore from files inside the data dir so a request
      // cannot read an arbitrary file off the developer's machine.
      let resolved: string;
      try {
        resolved = this.confineToDataDir(backupPath);
      } catch {
        return reply.code(400).send({
          error: 'invalid_path',
          message: 'backupPath escapes data dir',
        });
      }
      await this.restore(resolved);
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
