import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RemoteConfig } from '../lib/remote-config.js';

describe('RemoteConfig credential file', () => {
  let tempHome: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'calimero-remote-cfg-'));
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('writes the config file with mode 0600 (owner-only)', () => {
    const config = new RemoteConfig();
    config.setApiKey('secret-token-123');

    const configPath = config.getConfigPath();
    expect(fs.existsSync(configPath)).toBe(true);

    // Only the low permission bits matter here.
    const mode = fs.statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('tightens an already-existing world-readable config file to 0600', () => {
    const config = new RemoteConfig();
    const configPath = config.getConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    // Simulate a pre-existing, world-readable file from an older CLI version.
    fs.writeFileSync(configPath, '{"registry":{"url":"https://x"}}', {
      mode: 0o644,
    });
    fs.chmodSync(configPath, 0o644);

    config.setApiKey('secret-token-123');

    const mode = fs.statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('flags plain-http remote URLs as insecure but allows localhost/https', () => {
    expect(
      RemoteConfig.isInsecureRemoteUrl('http://apps.calimero.network')
    ).toBe(true);
    expect(
      RemoteConfig.isInsecureRemoteUrl('https://apps.calimero.network')
    ).toBe(false);
    expect(RemoteConfig.isInsecureRemoteUrl('http://localhost:8080')).toBe(
      false
    );
    expect(RemoteConfig.isInsecureRemoteUrl('http://127.0.0.1:8080')).toBe(
      false
    );
    expect(RemoteConfig.isInsecureRemoteUrl('not-a-url')).toBe(false);
  });
});
