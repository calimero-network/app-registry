import fs from 'fs';
import path from 'path';
import { LocalConfig } from './local-config.js';

export interface AppSummary {
  name: string;
  developer_pubkey: string;
  latest_version: string;
  latest_cid: string;
  alias?: string;
}

export interface VersionInfo {
  semver: string;
  cid: string;
  yanked: boolean;
}

export interface AppManifest {
  manifest_version: string;
  app: {
    name: string;
    namespace: string;
    developer_pubkey: string;
    id?: string;
    alias?: string;
  };
  version: {
    semver: string;
  };
  supported_chains: string[];
  permissions: Array<{
    cap: string;
    bytes: number;
  }>;
  artifacts: Array<{
    type: 'wasm';
    target: string;
    path?: string;
    cid?: string;
    mirrors?: string[];
    size: number;
    sha256?: string;
  }>;
  metadata: Record<string, unknown>;
  distribution: string;
  signature: {
    alg: string;
    sig: string;
    signed_at: string;
  };
}

export interface LocalRegistryData {
  apps: Map<string, AppSummary>;
  manifests: Map<string, AppManifest>;
  artifacts: Map<string, string>; // hash -> file path
}

export class LocalDataStore {
  private config: LocalConfig;
  private data: LocalRegistryData;
  private appsFile: string;
  private manifestsFile: string;
  private artifactsFile: string;

  constructor(config: LocalConfig) {
    this.config = config;
    this.appsFile = path.join(config.getDataDir(), 'apps.json');
    this.manifestsFile = path.join(config.getDataDir(), 'manifests.json');
    this.artifactsFile = path.join(config.getDataDir(), 'artifacts.json');
    this.data = {
      apps: new Map(),
      manifests: new Map(),
      artifacts: new Map(),
    };
    this.loadData();
  }

  private loadData(): void {
    try {
      // Load apps
      if (fs.existsSync(this.appsFile)) {
        const appsData = JSON.parse(fs.readFileSync(this.appsFile, 'utf8'));
        this.data.apps = new Map(Object.entries(appsData));
      }

      // Load manifests
      if (fs.existsSync(this.manifestsFile)) {
        const manifestsData = JSON.parse(
          fs.readFileSync(this.manifestsFile, 'utf8')
        );
        this.data.manifests = new Map(Object.entries(manifestsData));
      }

      // Load artifacts
      if (fs.existsSync(this.artifactsFile)) {
        const artifactsData = JSON.parse(
          fs.readFileSync(this.artifactsFile, 'utf8')
        );
        this.data.artifacts = new Map(Object.entries(artifactsData));
      }
    } catch {
      console.warn('Failed to load existing data, starting fresh');
    }
  }

  private saveData(): void {
    try {
      // Ensure data directory exists
      this.config.ensureDirectories();

      // Save apps
      const appsObj = Object.fromEntries(this.data.apps);
      fs.writeFileSync(this.appsFile, JSON.stringify(appsObj, null, 2));

      // Save manifests
      const manifestsObj = Object.fromEntries(this.data.manifests);
      fs.writeFileSync(
        this.manifestsFile,
        JSON.stringify(manifestsObj, null, 2)
      );

      // Save artifacts
      const artifactsObj = Object.fromEntries(this.data.artifacts);
      fs.writeFileSync(
        this.artifactsFile,
        JSON.stringify(artifactsObj, null, 2)
      );
    } catch (error) {
      throw new Error(
        `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Apps management
  getApps(filters?: { dev?: string; name?: string }): AppSummary[] {
    let apps = Array.from(this.data.apps.values());

    if (filters?.dev) {
      apps = apps.filter(app => app.developer_pubkey === filters.dev);
    }

    if (filters?.name) {
      apps = apps.filter(app => app.name.includes(filters.name!));
    }

    return apps;
  }

  getApp(appKey: string): AppSummary | undefined {
    return this.data.apps.get(appKey);
  }

  setApp(appKey: string, app: AppSummary): void {
    this.data.apps.set(appKey, app);
    this.saveData();
  }

  // Versions management
  getAppVersions(appId: string): VersionInfo[] {
    const versions: VersionInfo[] = [];

    for (const [key, manifest] of this.data.manifests.entries()) {
      if (manifest.app.id === appId) {
        const semver = key.split('/').pop()!;
        versions.push({
          semver,
          cid: manifest.artifacts[0]?.cid || '',
          yanked: false, // TODO: Implement yanking
        });
      }
    }

    return versions.sort((a, b) =>
      a.semver.localeCompare(b.semver, undefined, { numeric: true })
    );
  }

  // Manifest management
  getManifest(appId: string, semver: string): AppManifest | undefined {
    // Find the manifest key by appId
    for (const [, manifest] of this.data.manifests.entries()) {
      if (manifest.app.id === appId && manifest.version.semver === semver) {
        return manifest;
      }
    }
    return undefined;
  }

  setManifest(manifestKey: string, manifest: AppManifest): void {
    this.data.manifests.set(manifestKey, manifest);
    this.saveData();
  }

  // Artifact management
  getArtifactPath(hash: string): string | undefined {
    return this.data.artifacts.get(hash);
  }

  setArtifactPath(hash: string, filePath: string): void {
    this.data.artifacts.set(hash, filePath);
    this.saveData();
  }

  // Statistics
  getStats() {
    return {
      publishedApps: this.data.apps.size,
      totalVersions: this.data.manifests.size,
      totalArtifacts: this.data.artifacts.size,
    };
  }

  // Backup and restore
  async backup(outputPath?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath =
      outputPath ||
      path.join(
        this.config.getDataDir(),
        'backups',
        `backup-${timestamp}.json`
      );

    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      apps: Object.fromEntries(this.data.apps),
      manifests: Object.fromEntries(this.data.manifests),
      artifacts: Object.fromEntries(this.data.artifacts),
    };

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    return backupPath;
  }

  async restore(backupPath: string): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    // Restore data
    this.data.apps = new Map(Object.entries(backupData.apps || {}));
    this.data.manifests = new Map(Object.entries(backupData.manifests || {}));
    this.data.artifacts = new Map(Object.entries(backupData.artifacts || {}));

    this.saveData();
  }

  // Reset data
  reset(): void {
    this.data.apps.clear();
    this.data.manifests.clear();
    this.data.artifacts.clear();
    this.saveData();
  }

  // Seed with sample data
  async seed(): Promise<void> {
    const sampleApps: AppSummary[] = [
      {
        name: 'sample-wallet',
        developer_pubkey:
          'ed25519:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        latest_version: '1.0.0',
        latest_cid: 'QmSampleWallet123',
        alias: 'Sample Wallet',
      },
      {
        name: 'demo-dex',
        developer_pubkey:
          'ed25519:5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        latest_version: '2.1.0',
        latest_cid: 'QmDemoDex456',
        alias: 'Demo DEX',
      },
    ];

    const sampleManifests: AppManifest[] = [
      {
        manifest_version: '1.0',
        app: {
          name: 'sample-wallet',
          namespace: 'com.example',
          developer_pubkey:
            'ed25519:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          id: 'sample-wallet-id',
          alias: 'Sample Wallet',
        },
        version: {
          semver: '1.0.0',
        },
        supported_chains: ['mainnet', 'testnet'],
        permissions: [
          { cap: 'wallet', bytes: 1024 },
          { cap: 'network', bytes: 512 },
        ],
        artifacts: [
          {
            type: 'wasm',
            target: 'node',
            path: '/artifacts/sample-wallet/1.0.0/app.wasm',
            size: 1024000,
            sha256: 'abc123def456',
          },
        ],
        metadata: {
          description: 'A sample wallet application for testing',
          author: 'Sample Developer',
        },
        distribution: 'local',
        signature: {
          alg: 'ed25519',
          sig: 'sample-signature',
          signed_at: new Date().toISOString(),
        },
      },
    ];

    // Add sample apps
    sampleApps.forEach(app => {
      const appKey = `${app.developer_pubkey}/${app.name}`;
      this.setApp(appKey, app);
    });

    // Add sample manifests
    sampleManifests.forEach(manifest => {
      const manifestKey = `${manifest.app.developer_pubkey}/${manifest.app.name}/${manifest.version.semver}`;
      this.setManifest(manifestKey, manifest);
    });

    this.saveData();
  }
}
