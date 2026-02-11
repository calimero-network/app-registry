import fs from 'fs';
import path from 'path';
import { LocalConfig } from './local-config.js';

export interface AppSummary {
  id: string;
  name: string;
  latest_version: string;
  latest_digest: string;
  developer_pubkey?: string;
  alias?: string;
}

export interface VersionInfo {
  semver: string;
  digest: string;
  cid: string; // Added for compatibility
  yanked: boolean;
}

// --- V2 / Bundle Manifest Support ---

export interface BundleArtifact {
  path: string;
  hash: string | null;
  size: number;
}

export interface BundleMetadata {
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  license?: string;
}

export interface BundleInterfaces {
  exports?: string[];
  uses?: string[];
}

export interface BundleLinks {
  frontend?: string;
  github?: string;
  docs?: string;
}

export interface BundleSignature {
  alg: string;
  sig: string;
  pubkey: string;
  signed_at: string;
}

export interface BundleManifest {
  version: string; // "1.0" (internal manifest version)
  package: string;
  appVersion: string;

  metadata?: BundleMetadata;
  interfaces?: BundleInterfaces;

  wasm?: BundleArtifact;
  abi?: BundleArtifact;
  migrations: BundleArtifact[];

  links?: BundleLinks;
  signature?: BundleSignature;

  /** Minimum runtime version required by this bundle (e.g. "0.2.0"). Preserved when pushing. */
  minRuntimeVersion?: string;
}

export interface LocalRegistryData {
  apps: Map<string, AppSummary>;
  bundleManifests: Map<string, BundleManifest>; // Key: "package/version"
  artifacts: Map<string, string>; // digest -> file path
}

export class LocalDataStore {
  private config: LocalConfig;
  private data: LocalRegistryData;
  private appsFile: string;
  private bundleManifestsFile: string;
  private artifactsFile: string;

  constructor(config: LocalConfig) {
    this.config = config;
    this.appsFile = path.join(config.getDataDir(), 'apps.json');
    this.bundleManifestsFile = path.join(
      config.getDataDir(),
      'bundle_manifests.json'
    );
    this.artifactsFile = path.join(config.getDataDir(), 'artifacts.json');
    this.data = {
      apps: new Map(),
      bundleManifests: new Map(),
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

      // Load bundle manifests
      if (fs.existsSync(this.bundleManifestsFile)) {
        const bundleManifestsData = JSON.parse(
          fs.readFileSync(this.bundleManifestsFile, 'utf8')
        );
        this.data.bundleManifests = new Map(
          Object.entries(bundleManifestsData)
        );
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

      // Save bundle manifests
      const bundleManifestsObj = Object.fromEntries(this.data.bundleManifests);
      fs.writeFileSync(
        this.bundleManifestsFile,
        JSON.stringify(bundleManifestsObj, null, 2)
      );

      // Save artifacts
      const artifactsObj = Object.fromEntries(this.data.artifacts);
      fs.writeFileSync(
        this.artifactsFile,
        JSON.stringify(artifactsObj, null, 2)
      );
    } catch (error) {
      throw new Error(
        `Failed to save data: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Apps management
  getApps(filters?: { name?: string; dev?: string }): AppSummary[] {
    let apps = Array.from(this.data.apps.values());

    if (filters?.name) {
      apps = apps.filter(app => app.name.includes(filters.name!));
    }

    if (filters?.dev) {
      apps = apps.filter(app => app.developer_pubkey === filters.dev);
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

  // Versions management (bundles only)
  getAppVersions(packageId: string): VersionInfo[] {
    const versions: VersionInfo[] = [];

    // Get bundle versions
    for (const [key, manifest] of this.data.bundleManifests.entries()) {
      if (key.startsWith(`${packageId}/`)) {
        const semver = key.split('/').pop()!;
        const digest = manifest.wasm?.hash || '';
        versions.push({
          semver,
          digest,
          cid: digest, // Compatibility
          yanked: false,
        });
      }
    }

    return versions.sort((a, b) =>
      a.semver.localeCompare(b.semver, undefined, { numeric: true })
    );
  }

  // Manifest management (V2 / Bundles)
  getBundleManifest(pkg: string, version: string): BundleManifest | undefined {
    const key = `${pkg}/${version}`;
    return this.data.bundleManifests.get(key);
  }

  setBundleManifest(
    pkg: string,
    version: string,
    manifest: BundleManifest
  ): void {
    const key = `${pkg}/${version}`;
    this.data.bundleManifests.set(key, manifest);
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
      totalVersions: this.data.bundleManifests.size,
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
      bundleManifests: Object.fromEntries(this.data.bundleManifests),
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
    this.data.bundleManifests = new Map(
      Object.entries(backupData.bundleManifests || {})
    );
    this.data.artifacts = new Map(Object.entries(backupData.artifacts || {}));

    this.saveData();
  }

  // Reset data
  reset(): void {
    this.data.apps.clear();
    this.data.bundleManifests.clear();
    this.data.artifacts.clear();
    this.saveData();
  }

  /**
   * Get all bundle manifests
   */
  getAllBundles(): BundleManifest[] {
    return Array.from(this.data.bundleManifests.values());
  }

  // Seed with sample data
  async seed(): Promise<void> {
    // V2 Sample Bundle
    const bundleManifest: BundleManifest = {
      version: '1.0',
      package: 'com.calimero.sample-bundle',
      appVersion: '1.0.0',
      metadata: {
        name: 'Sample Bundle App',
        description: 'A sample application using V2 Bundle Manifest',
        tags: ['sample', 'v2'],
        license: 'MIT',
      },
      interfaces: {
        exports: ['com.calimero.sample.v1'],
        uses: [],
      },
      links: {
        frontend: 'https://example.com/app',
        github: 'https://github.com/example/app',
      },
      wasm: {
        path: 'app.wasm',
        size: 1024,
        hash: null,
      },
      abi: {
        path: 'abi.json',
        size: 512,
        hash: null,
      },
      migrations: [],
    };

    this.setBundleManifest(
      bundleManifest.package,
      bundleManifest.appVersion,
      bundleManifest
    );
  }
}
