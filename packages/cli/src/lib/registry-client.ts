import { SSAppRegistryClient } from '@calimero-network/registry-client';
import { LocalConfig } from './local-config.js';
import { LocalDataStore } from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
import { AppSummary, VersionInfo, AppManifest } from './local-storage.js';
import fs from 'fs';
import path from 'path';

export interface RegistryClient {
  getApps(filters?: { dev?: string; name?: string }): Promise<AppSummary[]>;
  getAppVersions(appId: string): Promise<VersionInfo[]>;
  getAppManifest(appId: string, semver: string): Promise<AppManifest>;
  submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }>;
  healthCheck(): Promise<{ status: string }>;
}

export class RemoteRegistryClient implements RegistryClient {
  private client: SSAppRegistryClient;

  constructor(baseURL: string, timeout: number) {
    this.client = new SSAppRegistryClient({
      baseURL,
      timeout,
    });
  }

  async getApps(filters?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    return await this.client.getApps(filters);
  }

  async getAppVersions(appId: string): Promise<VersionInfo[]> {
    return await this.client.getAppVersions(appId);
  }

  async getAppManifest(appId: string, semver: string): Promise<AppManifest> {
    return await this.client.getAppManifest(appId, semver);
  }

  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    return await this.client.submitAppManifest(manifest);
  }

  async healthCheck(): Promise<{ status: string }> {
    return await this.client.healthCheck();
  }
}

export class LocalRegistryClient implements RegistryClient {
  private config: LocalConfig;
  private dataStore: LocalDataStore;
  private artifactServer: LocalArtifactServer;

  constructor() {
    this.config = new LocalConfig();
    this.dataStore = new LocalDataStore(this.config);
    this.artifactServer = new LocalArtifactServer(this.config, this.dataStore);
  }

  async getApps(filters?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    return this.dataStore.getApps(filters);
  }

  async getAppVersions(appId: string): Promise<VersionInfo[]> {
    return this.dataStore.getAppVersions(appId);
  }

  async getAppManifest(appId: string, semver: string): Promise<AppManifest> {
    const manifest = this.dataStore.getManifest(appId, semver);
    if (!manifest) {
      throw new Error('Manifest not found');
    }
    return this.artifactServer.updateManifestArtifacts(manifest);
  }

  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    // Validate manifest
    if (!this.validateManifest(manifest)) {
      throw new Error('Invalid manifest structure');
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
    };
  }

  async healthCheck(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  private validateManifest(manifest: AppManifest): boolean {
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

export function createRegistryClient(
  useLocal: boolean,
  baseURL?: string,
  timeout?: number
): RegistryClient {
  if (useLocal) {
    return new LocalRegistryClient();
  } else {
    return new RemoteRegistryClient(
      baseURL || 'http://localhost:8082',
      timeout || 10000
    );
  }
}
