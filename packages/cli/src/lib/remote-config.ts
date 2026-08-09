import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * The public registry, named once. It was written out in loadConfig, in reset
 * and in getRegistryUrl, which is three places for one value to drift.
 */
export const DEFAULT_REGISTRY_URL = 'https://apps.calimero.network';

function defaultConfig(): RemoteConfigData {
  return { registry: { url: DEFAULT_REGISTRY_URL } };
}

export interface RemoteConfigData {
  registry: {
    url: string;
    apiKey?: string;
  };
}

export class RemoteConfig {
  private configPath: string;
  private config: RemoteConfigData;

  constructor() {
    this.configPath = path.join(
      os.homedir(),
      '.calimero-registry',
      'remote-config.json'
    );
    this.config = this.loadConfig();
  }

  private loadConfig(): RemoteConfigData {
    const defaults = defaultConfig();

    // Load existing config if it exists
    if (fs.existsSync(this.configPath)) {
      try {
        const existingConfig = JSON.parse(
          fs.readFileSync(this.configPath, 'utf8')
        );
        return {
          registry: {
            ...defaults.registry,
            ...(existingConfig.registry || {}),
          },
        };
      } catch {
        console.warn('Failed to load existing config, using defaults');
      }
    }

    return defaults;
  }

  private saveConfig(): void {
    // Ensure config directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save config - always save API key if it's set in config
    // (env var takes precedence when reading, but doesn't prevent saving)
    const configToSave: RemoteConfigData = {
      registry: {
        url: this.config.registry.url,
        // Save API key if it exists in config (regardless of env var)
        ...(this.config.registry.apiKey
          ? { apiKey: this.config.registry.apiKey }
          : {}),
      },
    };
    fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
  }

  /**
   * Get registry URL with priority:
   * 1. Environment variable CALIMERO_REGISTRY_URL
   * 2. Config file value
   * 3. Default value
   */
  getRegistryUrl(): string {
    return (
      process.env.CALIMERO_REGISTRY_URL ||
      this.config.registry.url ||
      DEFAULT_REGISTRY_URL
    );
  }

  /**
   * Set registry URL
   */
  setRegistryUrl(url: string): void {
    this.config.registry.url = url;
    this.saveConfig();
  }

  /**
   * Get API key with priority:
   * 1. Environment variable CALIMERO_API_KEY
   * 2. Config file value
   * 3. undefined
   */
  getApiKey(): string | undefined {
    return process.env.CALIMERO_API_KEY || this.config.registry.apiKey;
  }

  /**
   * Set API key (stored in config file)
   */
  setApiKey(apiKey: string): void {
    this.config.registry.apiKey = apiKey;
    this.saveConfig();
  }

  /**
   * Remove API key from config
   */
  removeApiKey(): void {
    delete this.config.registry.apiKey;
    this.saveConfig();
  }

  /**
   * Get full configuration
   */
  getConfig(): RemoteConfigData {
    return {
      registry: {
        url: this.getRegistryUrl(),
        // Don't expose API key in getConfig (security)
        apiKey: this.getApiKey() ? '***' : undefined,
      },
    };
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = defaultConfig();
    this.saveConfig();
  }
}
