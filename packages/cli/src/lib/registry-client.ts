import { SSAppRegistryClient } from '@calimero-network/registry-client';
import { LocalConfig } from './local-config.js';
import {
  LocalDataStore,
  AppSummary,
  VersionInfo,
  V1Manifest,
} from './local-storage.js';
import { LocalArtifactServer } from './local-artifacts.js';
import fs from 'fs';
import path from 'path';

export interface RegistryClient {
  getApps(filters?: { name?: string }): Promise<AppSummary[]>;
  getAppVersions(appId: string): Promise<VersionInfo[]>;
  getAppManifest(appId: string, semver: string): Promise<V1Manifest>;
  submitAppManifest(
    manifest: V1Manifest
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

  async getApps(filters?: { name?: string }): Promise<AppSummary[]> {
    return await this.client.getApps(filters);
  }

  async getAppVersions(appId: string): Promise<VersionInfo[]> {
    return await this.client.getAppVersions(appId);
  }

  async getAppManifest(appId: string, semver: string): Promise<V1Manifest> {
    return await this.client.getAppManifest(appId, semver);
  }

  async submitAppManifest(
    manifest: V1Manifest
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

  async getApps(filters?: { name?: string }): Promise<AppSummary[]> {
    return this.dataStore.getApps(filters);
  }

  async getAppVersions(appId: string): Promise<VersionInfo[]> {
    return this.dataStore.getAppVersions(appId);
  }

  async getAppManifest(appId: string, semver: string): Promise<V1Manifest> {
    const manifest = this.dataStore.getManifest(appId, semver);
    if (!manifest) {
      throw new Error('Manifest not found');
    }
    return this.artifactServer.updateManifestArtifact(manifest);
  }

  async submitAppManifest(
    manifest: V1Manifest
  ): Promise<{ success: boolean; message: string }> {
    if (!this.validateManifest(manifest)) {
      throw new Error('Invalid manifest structure');
    }

    const processedManifest = await this.processManifestArtifacts(manifest);
    const manifestKey = `${processedManifest.id}/${processedManifest.version}`;
    this.dataStore.setManifest(manifestKey, processedManifest);

    const appSummary: AppSummary = {
      id: processedManifest.id,
      name: processedManifest.name,
      latest_version: processedManifest.version,
      latest_digest: processedManifest.artifact.digest,
    };
    this.dataStore.setApp(processedManifest.id, appSummary);

    return {
      success: true,
      message: 'App version registered successfully',
    };
  }

  async healthCheck(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  private validateManifest(manifest: V1Manifest): boolean {
    return !!(
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
