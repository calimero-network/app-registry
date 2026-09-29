import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalConfig } from '../lib/local-config.js';
import { LocalDataStore, AppSummary } from '../lib/local-storage.js';
import { LocalArtifactServer } from '../lib/local-artifacts.js';
import { LocalRegistryServer } from '../lib/local-server.js';
import { localCommand } from '../commands/local.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Local Registry', () => {
  let config: LocalConfig;
  let dataStore: LocalDataStore;
  let artifactServer: LocalArtifactServer;
  let server: LocalRegistryServer;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calimero-registry-test-'));

    // Override config to use temp directory
    config = new LocalConfig();
    config.setDataDir(path.join(tempDir, 'data'));
    config.setArtifactsDir(path.join(tempDir, 'artifacts'));
    // Reset to default port and host for status test
    config.setPort(8082);
    config.setHost('localhost');

    dataStore = new LocalDataStore(config);
    artifactServer = new LocalArtifactServer(config, dataStore);
    server = new LocalRegistryServer(config);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('LocalConfig', () => {
    it('should create default configuration', () => {
      expect(config.getPort()).toBe(8082);
      expect(config.getHost()).toBe('localhost');
      expect(config.getDataDir()).toContain('data');
    });

    it('should allow configuration updates', () => {
      config.setPort(9000);
      config.setHost('0.0.0.0');

      expect(config.getPort()).toBe(9000);
      expect(config.getHost()).toBe('0.0.0.0');
    });
  });

  describe('LocalDataStore', () => {
    it('should store and retrieve apps', () => {
      const app: AppSummary = {
        name: 'test-app',
        developer_pubkey: 'ed25519:test123',
        latest_version: '1.0.0',
        latest_cid: 'QmTest123',
        alias: 'Test App',
      };

      dataStore.setApp('test-key', app);
      const retrieved = dataStore.getApp('test-key');

      expect(retrieved).toEqual(app);
    });

    it('should filter apps by developer', () => {
      const app1: AppSummary = {
        name: 'app1',
        developer_pubkey: 'ed25519:dev1',
        latest_version: '1.0.0',
        latest_cid: 'QmApp1',
      };

      const app2: AppSummary = {
        name: 'app2',
        developer_pubkey: 'ed25519:dev2',
        latest_version: '1.0.0',
        latest_cid: 'QmApp2',
      };

      dataStore.setApp('dev1/app1', app1);
      dataStore.setApp('dev2/app2', app2);

      const dev1Apps = dataStore.getApps({ dev: 'ed25519:dev1' });
      expect(dev1Apps).toHaveLength(1);
      expect(dev1Apps[0].name).toBe('app1');
    });

    it('should seed with sample data', async () => {
      await dataStore.seed();

      // After removing V1, seed only creates bundle manifests
      // Check that bundle is seeded
      const bundle = dataStore.getBundleManifest(
        'com.calimero.sample-bundle',
        '1.0.0'
      );
      expect(bundle).not.toBeNull();
      expect(bundle?.package).toBe('com.calimero.sample-bundle');
      expect(bundle?.metadata?.name).toBe('Sample Bundle App');
    });
  });

  describe('LocalArtifactServer', () => {
    it('should validate artifact files', async () => {
      // Create a test file
      const testFile = path.join(tempDir, 'test.wasm');
      const testContent = 'test wasm content';
      fs.writeFileSync(testFile, testContent);

      const validation = await artifactServer.validateArtifact(testFile);

      expect(validation.size).toBe(testContent.length);
      expect(validation.sha256).toBeDefined();
    });

    it('should generate artifact URLs', () => {
      const url = artifactServer.getArtifactUrl(
        'test-app',
        '1.0.0',
        'app.wasm'
      );

      expect(url).toContain('test-app');
      expect(url).toContain('1.0.0');
      expect(url).toContain('app.wasm');
    });
  });

  describe('LocalRegistryServer', () => {
    it('should get status when not running', async () => {
      const status = await server.getStatus();

      expect(status.running).toBe(false);
      expect(status.url).toContain('localhost:8082');
    });

    it('should reset data', async () => {
      // Add some data to the server's data store
      server['dataStore'].setApp('test-key', {
        name: 'test',
        developer_pubkey: 'ed25519:test',
        latest_version: '1.0.0',
        latest_cid: 'QmTest',
      });

      // Verify data exists
      expect(server['dataStore'].getApps()).toHaveLength(1);

      // Reset
      await server.reset();

      // Verify reset
      const apps = server['dataStore'].getApps();
      expect(apps).toHaveLength(0);
    });

    it('should backup and restore data', async () => {
      // Add some data to the server's data store
      server['dataStore'].setApp('test-key', {
        name: 'test',
        developer_pubkey: 'ed25519:test',
        latest_version: '1.0.0',
        latest_cid: 'QmTest',
      });

      // Verify data exists
      expect(server['dataStore'].getApps()).toHaveLength(1);

      // Backup
      const backupPath = await server.backup();
      expect(fs.existsSync(backupPath)).toBe(true);

      // Reset
      await server.reset();
      expect(server['dataStore'].getApps()).toHaveLength(0);

      // Restore
      await server.restore(backupPath);

      // Verify restore
      const restoredApps = server['dataStore'].getApps();
      expect(restoredApps).toHaveLength(1);
      expect(restoredApps[0].name).toBe('test');
    });
  });

  describe('Security hardening', () => {
    it('defaults the bind host to loopback (config)', () => {
      // Fresh HOME so no saved config.json shadows the built-in default.
      const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-home-'));
      const prevHome = process.env.HOME;
      process.env.HOME = homeDir;
      try {
        const fresh = new LocalConfig();
        expect(fresh.getHost()).toBe('127.0.0.1');
      } finally {
        if (prevHome === undefined) delete process.env.HOME;
        else process.env.HOME = prevHome;
        fs.rmSync(homeDir, { recursive: true, force: true });
      }
    });

    it('defaults the --host option to loopback (CLI)', () => {
      const start = localCommand.commands.find(c => c.name() === 'start');
      expect(start).toBeDefined();
      const hostOption = start!.options.find(o => o.long === '--host');
      expect(hostOption?.defaultValue).toBe('127.0.0.1');
    });

    it('rejects a path traversal in serveArtifact', async () => {
      await expect(
        artifactServer.serveArtifact('..', '..', 'etc-passwd')
      ).rejects.toThrow(/escapes artifacts directory/);
    });

    describe('running server', () => {
      const port = 18099;

      beforeEach(async () => {
        config.setHost('127.0.0.1');
        await server.start(port);
      });

      afterEach(async () => {
        await server.stop();
      });

      it('rejects a non-localhost Host header (anti DNS-rebinding)', async () => {
        const app = server['server'];
        const res = await app.inject({
          method: 'GET',
          url: '/healthz',
          headers: { host: 'evil.example.com' },
        });
        expect(res.statusCode).toBe(403);
      });

      it('accepts a loopback Host header', async () => {
        const app = server['server'];
        const res = await app.inject({
          method: 'GET',
          url: '/healthz',
          headers: { host: `127.0.0.1:${port}` },
        });
        expect(res.statusCode).toBe(200);
      });

      it('does not expose backup/restore/reset over GET', async () => {
        const app = server['server'];
        const headers = { host: `127.0.0.1:${port}` };

        const backup = await app.inject({
          method: 'GET',
          url: '/local/backup',
          headers,
        });
        expect(backup.statusCode).toBe(404);

        const restore = await app.inject({
          method: 'GET',
          url: '/local/restore',
          headers,
        });
        expect(restore.statusCode).toBe(404);

        const reset = await app.inject({
          method: 'GET',
          url: '/local/reset',
          headers,
        });
        expect(reset.statusCode).toBe(404);
      });

      it('rejects a mutating request with a foreign Origin', async () => {
        const app = server['server'];
        await server.seed();
        expect(server['dataStore'].getAllBundles()).toHaveLength(1);
        const res = await app.inject({
          method: 'POST',
          url: '/local/reset',
          headers: {
            host: `127.0.0.1:${port}`,
            origin: 'https://evil.example.com',
            'content-type': 'application/json',
          },
          payload: '{}',
        });
        expect(res.statusCode).toBe(403);
        expect(server['dataStore'].getAllBundles()).toHaveLength(1);
      });

      it('rejects Origin: null on a mutating request', async () => {
        const app = server['server'];
        const res = await app.inject({
          method: 'POST',
          url: '/local/seed',
          headers: {
            host: `127.0.0.1:${port}`,
            origin: 'null',
            'content-type': 'application/json',
          },
          payload: '{}',
        });
        expect(res.statusCode).toBe(403);
      });

      it('rejects a cross-site Sec-Fetch-Site on a mutating request', async () => {
        const app = server['server'];
        for (const site of ['cross-site', 'same-site']) {
          const res = await app.inject({
            method: 'POST',
            url: '/local/reset',
            headers: {
              host: `127.0.0.1:${port}`,
              'sec-fetch-site': site,
              'content-type': 'application/json',
            },
            payload: '{}',
          });
          expect(res.statusCode).toBe(403);
        }
      });

      it('rejects a non-JSON body on /local/* mutating routes', async () => {
        const app = server['server'];
        await server.seed();
        expect(server['dataStore'].getAllBundles()).toHaveLength(1);
        for (const contentType of [
          undefined,
          'text/plain',
          'application/x-www-form-urlencoded',
          'multipart/form-data; boundary=x',
        ]) {
          const headers: Record<string, string> = {
            host: `127.0.0.1:${port}`,
          };
          if (contentType) headers['content-type'] = contentType;
          const res = await app.inject({
            method: 'POST',
            url: '/local/reset',
            headers,
            payload: contentType ? 'x' : undefined,
          });
          expect(res.statusCode).toBe(415);
        }
        expect(server['dataStore'].getAllBundles()).toHaveLength(1);
      });

      it('accepts a JSON request from a non-browser client or loopback origin', async () => {
        const app = server['server'];
        const seeded = await app.inject({
          method: 'POST',
          url: '/local/seed',
          headers: {
            host: `127.0.0.1:${port}`,
            'content-type': 'application/json; charset=utf-8',
          },
          payload: '{}',
        });
        expect(seeded.statusCode).toBe(200);
        expect(server['dataStore'].getAllBundles()).toHaveLength(1);

        const reset = await app.inject({
          method: 'POST',
          url: '/local/reset',
          headers: {
            host: `localhost:${port}`,
            origin: `http://localhost:${port}`,
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
          },
          payload: '{}',
        });
        expect(reset.statusCode).toBe(200);
        expect(server['dataStore'].getAllBundles()).toHaveLength(0);
      });

      it('does not apply the Origin check to GET requests', async () => {
        const app = server['server'];
        const res = await app.inject({
          method: 'GET',
          url: '/healthz',
          headers: {
            host: `127.0.0.1:${port}`,
            origin: 'https://evil.example.com',
            'sec-fetch-site': 'cross-site',
          },
        });
        expect(res.statusCode).toBe(200);
      });
    });
  });
});
