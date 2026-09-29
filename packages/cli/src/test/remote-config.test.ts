import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Command } from 'commander';
import { RemoteConfig } from '../lib/remote-config.js';
import { orgCommand } from '../commands/org.js';
import { bundleCommand } from '../commands/bundle.js';

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
    expect(RemoteConfig.isInsecureRemoteUrl('http://[::1]:8080')).toBe(false);
  });

  it('refuses to send an API key over http:// to a non-loopback host', () => {
    expect(() =>
      RemoteConfig.assertApiKeyTransport('http://registry.example.com', 'k')
    ).toThrow(/Refusing to send the API key/);
    expect(() =>
      RemoteConfig.assertApiKeyTransport('http://10.0.0.5:8080', 'k')
    ).toThrow(/Refusing to send the API key/);
  });

  it('allows an API key over https:// and to loopback over http://', () => {
    for (const url of [
      'https://apps.calimero.network',
      'http://localhost:8082',
      'http://127.0.0.1:8082',
      'http://[::1]:8082',
    ]) {
      expect(() => RemoteConfig.assertApiKeyTransport(url, 'k')).not.toThrow();
    }
  });

  it('allows any URL when no API key would be sent', () => {
    expect(() =>
      RemoteConfig.assertApiKeyTransport(
        'http://registry.example.com',
        undefined
      )
    ).not.toThrow();
  });
});

describe('API key transport in commands', () => {
  let tempHome: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const prevKey = process.env.CALIMERO_API_KEY;
  const prevUrl = process.env.CALIMERO_REGISTRY_URL;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'calimero-remote-cfg-'));
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
    process.env.CALIMERO_API_KEY = 'secret-token-123';
    delete process.env.CALIMERO_REGISTRY_URL;
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new globalThis.Response('{}', { status: 200 }));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    homedirSpy.mockRestore();
    if (prevKey === undefined) delete process.env.CALIMERO_API_KEY;
    else process.env.CALIMERO_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.CALIMERO_REGISTRY_URL;
    else process.env.CALIMERO_REGISTRY_URL = prevUrl;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function program(): Command {
    const root = new Command()
      .exitOverride()
      .option('-u, --url <url>')
      .option('-t, --timeout <timeout>', '', '10000');
    root.addCommand(orgCommand);
    root.addCommand(bundleCommand);
    return root;
  }

  it('org create refuses an http:// registry from --url', async () => {
    await expect(
      program().parseAsync(
        [
          '--url',
          'http://registry.example.com',
          'org',
          'create',
          '-n',
          'A',
          '-s',
          'a',
        ],
        { from: 'user' }
      )
    ).rejects.toThrow(/process\.exit\(1\)/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(
      /Refusing to send the API key/
    );
  });

  it('org create refuses an http:// registry from CALIMERO_REGISTRY_URL', async () => {
    process.env.CALIMERO_REGISTRY_URL = 'http://registry.example.com';
    await expect(
      program().parseAsync(['org', 'create', '-n', 'A', '-s', 'a'], {
        from: 'user',
      })
    ).rejects.toThrow(/process\.exit\(1\)/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('org create still talks to an http://localhost registry', async () => {
    fetchSpy.mockResolvedValue(
      new globalThis.Response(
        JSON.stringify({ id: 'o', name: 'A', slug: 'a' }),
        {
          status: 201,
        }
      )
    );
    await program().parseAsync(
      ['--url', 'http://localhost:8082', 'org', 'create', '-n', 'A', '-s', 'a'],
      { from: 'user' }
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(
      /^http:\/\/localhost:8082\//
    );
  });

  it('bundle edit refuses an http:// registry', async () => {
    await expect(
      program().parseAsync(
        [
          'bundle',
          'edit',
          'com.example.app',
          '1.0.0',
          '--remote',
          '--url',
          'http://registry.example.com',
        ],
        { from: 'user' }
      )
    ).rejects.toThrow(/process\.exit\(1\)/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(
      /Refusing to send the API key/
    );
  });
});
