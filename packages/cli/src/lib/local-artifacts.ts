import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { LocalConfig } from './local-config.js';
import { LocalDataStore } from './local-storage.js';

export class LocalArtifactServer {
  private config: LocalConfig;
  private dataStore: LocalDataStore;
  private artifactsDir: string;

  constructor(config: LocalConfig, dataStore: LocalDataStore) {
    this.config = config;
    this.dataStore = dataStore;
    this.artifactsDir = config.getArtifactsDir();
    this.ensureArtifactsDir();
  }

  private ensureArtifactsDir(): void {
    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
  }

  // Copy artifact to local storage
  async copyArtifactToLocal(
    sourcePath: string,
    appId: string,
    version: string,
    filename: string
  ): Promise<string> {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    // Create app version directory
    const appVersionDir = path.join(this.artifactsDir, appId, version);
    if (!fs.existsSync(appVersionDir)) {
      fs.mkdirSync(appVersionDir, { recursive: true });
    }

    // Copy file to local storage
    const targetPath = path.join(appVersionDir, filename);
    fs.copyFileSync(sourcePath, targetPath);

    // Calculate file hash for tracking
    const fileHash = await this.calculateFileHash(targetPath);
    this.dataStore.setArtifactPath(fileHash, targetPath);

    return targetPath;
  }

  // Serve artifact by app ID, version, and filename
  async serveArtifact(
    appId: string,
    version: string,
    filename: string
  ): Promise<Buffer> {
    const artifactPath = path.join(this.artifactsDir, appId, version, filename);

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}`);
    }

    return fs.readFileSync(artifactPath);
  }

  // Serve artifact by hash
  async serveByHash(hash: string): Promise<Buffer> {
    const artifactPath = this.dataStore.getArtifactPath(hash);

    if (!artifactPath || !fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found for hash: ${hash}`);
    }

    return fs.readFileSync(artifactPath);
  }

  // Validate artifact file
  async validateArtifact(
    filePath: string
  ): Promise<{ size: number; sha256: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return {
      size: stats.size,
      sha256,
    };
  }

  // Calculate file hash
  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  // Get artifact URL for local serving
  getArtifactUrl(appId: string, version: string, filename: string): string {
    const baseUrl = `http://${this.config.getHost()}:${this.config.getPort()}`;
    return `${baseUrl}/artifacts/${appId}/${version}/${filename}`;
  }

  // Get artifact URL by hash
  getArtifactUrlByHash(hash: string): string {
    const baseUrl = `http://${this.config.getHost()}:${this.config.getPort()}`;
    return `${baseUrl}/artifacts/${hash}`;
  }

  // Update manifest artifacts to use local URLs
  updateManifestArtifacts(manifest: {
    artifacts?: Array<{
      path?: string;
      type: string;
      target: string;
      size: number;
      sha256: string;
    }>;
  }): {
    artifacts?: Array<{
      path?: string;
      type: string;
      target: string;
      size: number;
      sha256: string;
    }>;
  } {
    const updatedManifest = { ...manifest };

    if (updatedManifest.artifacts) {
      updatedManifest.artifacts = updatedManifest.artifacts.map(
        (artifact: {
          path?: string;
          type: string;
          target: string;
          size: number;
          sha256: string;
        }) => {
          const updatedArtifact = { ...artifact };

          // If artifact has a local path, update it to use local URL
          if (artifact.path) {
            const filename = path.basename(artifact.path);
            updatedArtifact.mirrors = [
              this.getArtifactUrl(
                manifest.app.id ||
                  manifest.app.name?.replace(/\s+/g, '-').toLowerCase(),
                manifest.version.semver,
                filename
              ),
            ];
            // Remove local path for production compatibility
            delete updatedArtifact.path;
          }

          return updatedArtifact;
        }
      );
    }

    return updatedManifest;
  }

  // Clean up old artifacts
  async cleanupOldArtifacts(
    maxAge: number = 30 * 24 * 60 * 60 * 1000
  ): Promise<void> {
    const now = Date.now();

    // Get all artifact files
    const getAllFiles = (dir: string): string[] => {
      let files: string[] = [];
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          files = files.concat(getAllFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }

      return files;
    };

    const allFiles = getAllFiles(this.artifactsDir);

    for (const file of allFiles) {
      const stats = fs.statSync(file);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        fs.unlinkSync(file);
        console.log(`Cleaned up old artifact: ${file}`);
      }
    }
  }

  // Get artifact statistics
  getArtifactStats(): {
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
  } {
    let totalFiles = 0;
    let totalSize = 0;
    let oldestFile: Date | null = null;

    const getAllFiles = (dir: string): string[] => {
      let files: string[] = [];
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          files = files.concat(getAllFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }

      return files;
    };

    if (fs.existsSync(this.artifactsDir)) {
      const allFiles = getAllFiles(this.artifactsDir);

      for (const file of allFiles) {
        const stats = fs.statSync(file);
        totalFiles++;
        totalSize += stats.size;

        if (!oldestFile || stats.mtime < oldestFile) {
          oldestFile = stats.mtime;
        }
      }
    }

    return {
      totalFiles,
      totalSize,
      oldestFile,
    };
  }
}
