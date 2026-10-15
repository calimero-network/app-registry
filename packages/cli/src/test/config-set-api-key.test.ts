import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configCommand } from '../commands/config.js';
import { RemoteConfig } from '../lib/remote-config.js';

describe('config set api-key without a value', () => {
  let home: string;
  const stdin = Object.getOwnPropertyDescriptor(process, 'stdin')!;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.CALIMERO_API_KEY;
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', stdin);
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('reads the key from stdin, so it never appears on the command line', async () => {
    Object.defineProperty(process, 'stdin', {
      value: Readable.from(['tok-from-stdin\n']),
      configurable: true,
    });
    await configCommand.parseAsync(['set', 'api-key'], { from: 'user' });
    expect(new RemoteConfig().getApiKey()).toBe('tok-from-stdin');
  });

  it('still needs a value for registry-url', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      configCommand.parseAsync(['set', 'registry-url'], { from: 'user' })
    ).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(fs.existsSync(path.join(home, '.calimero-registry'))).toBe(false);
  });
});
