import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LocalConfigData {
  server: {
    port: number;
    host: string;
  };
  data: {
    dir: string;
    artifactsDir: string;
  };
  artifacts: {
    storageDir: string;
    serveLocal: boolean;
    copyArtifacts: boolean;
    maxFileSize: string;
    allowedTypes: string[];
  };
}

export class LocalConfig {
  private configPath: string;
  private dataDir: string;
  private config: LocalConfigData;

  constructor() {
    this.configPath = path.join(
      os.homedir(),
      '.calimero-registry',
      'config.json'
    );
    this.dataDir = path.join(os.homedir(), '.calimero-registry');
    this.config = this.loadConfig();
  }

  private loadConfig(): LocalConfigData {
    // Create default config
    const defaultConfig: LocalConfigData = {
      server: {
        port: 8082,
        host: 'localhost',
      },
      data: {
        dir: path.join(os.homedir(), '.calimero-registry', 'data'),
        artifactsDir: path.join(
          os.homedir(),
          '.calimero-registry',
          'artifacts'
        ),
      },
      artifacts: {
        storageDir: path.join(os.homedir(), '.calimero-registry', 'artifacts'),
        serveLocal: true,
        copyArtifacts: true,
        maxFileSize: '100MB',
        allowedTypes: ['wasm', 'js', 'html'],
      },
    };

    // Load existing config if it exists
    if (fs.existsSync(this.configPath)) {
      try {
        const existingConfig = JSON.parse(
          fs.readFileSync(this.configPath, 'utf8')
        );
        return { ...defaultConfig, ...existingConfig };
      } catch {
        console.warn('Failed to load existing config, using defaults');
      }
    }

    return defaultConfig;
  }

  private saveConfig(): void {
    // Ensure config directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save config
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // Server configuration
  getPort(): number {
    return this.config.server.port;
  }

  setPort(port: number): void {
    this.config.server.port = port;
    this.saveConfig();
  }

  getHost(): string {
    return this.config.server.host;
  }

  setHost(host: string): void {
    this.config.server.host = host;
    this.saveConfig();
  }

  // Data directory configuration
  getDataDir(): string {
    return this.config.data.dir;
  }

  setDataDir(dir: string): void {
    this.config.data.dir = dir;
    this.config.artifacts.storageDir = path.join(dir, 'artifacts');
    this.saveConfig();
  }

  getArtifactsDir(): string {
    return this.config.data.artifactsDir;
  }

  setArtifactsDir(dir: string): void {
    this.config.data.artifactsDir = dir;
    this.config.artifacts.storageDir = dir;
    this.saveConfig();
  }

  // Artifact configuration
  getArtifactsConfig() {
    return this.config.artifacts;
  }

  setArtifactsConfig(config: Partial<LocalConfigData['artifacts']>): void {
    this.config.artifacts = { ...this.config.artifacts, ...config };
    this.saveConfig();
  }

  // Utility methods
  ensureDirectories(): void {
    const dirs = [
      this.getDataDir(),
      this.getArtifactsDir(),
      path.join(this.getDataDir(), 'backups'),
      path.join(this.getDataDir(), 'logs'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  getConfigPath(): string {
    return this.configPath;
  }

  // Get full configuration
  getConfig(): LocalConfigData {
    return { ...this.config };
  }

  // Reset to defaults
  reset(): void {
    this.config = {
      server: {
        port: 8082,
        host: 'localhost',
      },
      data: {
        dir: path.join(os.homedir(), '.calimero-registry', 'data'),
        artifactsDir: path.join(
          os.homedir(),
          '.calimero-registry',
          'artifacts'
        ),
      },
      artifacts: {
        storageDir: path.join(os.homedir(), '.calimero-registry', 'artifacts'),
        serveLocal: true,
        copyArtifacts: true,
        maxFileSize: '100MB',
        allowedTypes: ['wasm', 'js', 'html'],
      },
    };
    this.saveConfig();
  }
}
