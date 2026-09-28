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
    // SECURITY: this file holds the registry API key (a Bearer credential), so
    // it must not be world-readable. `mode` only applies when the file is newly
    // created, so chmod as well to tighten an existing file. chmod is best-effort
    // (it throws on filesystems that do not support POSIX modes, e.g. Windows).
    fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), {
      mode: 0o600,
    });
    try {
      fs.chmodSync(this.configPath, 0o600);
    } catch {
      // Filesystem does not support POSIX modes; nothing more we can do.
    }
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
    // SECURITY: the API key is sent as a Bearer token. Over plain http:// to a
    // non-localhost host it travels in cleartext, so warn (loopback is fine for
    // local dev). We warn rather than refuse so existing local setups keep
    // working; the credential itself is never weakened.
    if (RemoteConfig.isInsecureRemoteUrl(url)) {
      console.warn(
        '⚠️  Registry URL uses http:// on a non-local host. Your API key would ' +
          'be sent in cleartext — prefer https:// for remote registries.'
      );
    }
    this.config.registry.url = url;
    this.saveConfig();
  }

  /**
   * True when `url` is http:// to a host other than localhost/loopback, i.e. a
   * Bearer token would traverse the network in cleartext.
   */
  static isInsecureRemoteUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false; // not a parseable URL; leave validation to the caller
    }
    if (parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost');
    return !isLocal;
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
