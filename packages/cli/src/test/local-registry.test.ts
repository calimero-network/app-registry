import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalConfig } from '../lib/local-config.js';
import { LocalDataStore, AppSummary } from '../lib/local-storage.js';
import { LocalArtifactServer } from '../lib/local-artifacts.js';
import { LocalRegistryServer } from '../lib/local-server.js';
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
      const apps = dataStore.getApps();

      expect(apps.length).toBeGreaterThan(0);
      expect(apps[0].name).toBe('Sample Wallet');
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
});
