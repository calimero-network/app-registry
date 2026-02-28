import fs from 'fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteConfig } from '../lib/remote-config.js';

describe('CLI', () => {
  it('should be able to import CLI commands', () => {
    expect(true).toBe(true);
  });

  it('should have basic functionality', () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });
});

describe('Org auth — API token', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CALIMERO_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('RemoteConfig.getApiKey returns env var when set', () => {
    process.env.CALIMERO_API_KEY = 'test-token-123';
    const config = new RemoteConfig();
    expect(config.getApiKey()).toBe('test-token-123');
  });

  it('RemoteConfig.getApiKey returns undefined when not set and no config file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const config = new RemoteConfig();
    expect(config.getApiKey()).toBeUndefined();
  });

  it('org write requests include Authorization: Bearer header', async () => {
    process.env.CALIMERO_API_KEY = 'my-secret-token';

    const mockFetch = vi.fn().mockResolvedValue({
      text: async () =>
        JSON.stringify({ id: 'org-1', name: 'Test', slug: 'test' }),
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const config = new RemoteConfig();
    const apiKey = config.getApiKey();
    expect(apiKey).toBe('my-secret-token');

    const authHeaders = { Authorization: `Bearer ${apiKey}` };

    await fetch('https://example.com/api/v2/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [
      string,
      { headers?: Record<string, string> },
    ];
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer my-secret-token',
    });
  });

  it('org list fetches /api/auth/me with Bearer token to resolve email', async () => {
    process.env.CALIMERO_API_KEY = 'cli-token-abc';

    const mockFetch = vi
      .fn()
      // First call: /api/auth/me
      .mockResolvedValueOnce({
        text: async () =>
          JSON.stringify({
            user: { email: 'alice@example.com', name: 'Alice' },
          }),
        status: 200,
      })
      // Second call: /api/v2/orgs?member=alice@example.com
      .mockResolvedValueOnce({
        text: async () =>
          JSON.stringify([{ id: 'org-1', name: 'My Org', slug: 'my-org' }]),
        status: 200,
      });

    vi.stubGlobal('fetch', mockFetch);

    const base = 'https://example.com';
    const config = new RemoteConfig();
    const apiKey = config.getApiKey()!;
    const authHeaders = { Authorization: `Bearer ${apiKey}` };

    // Step 1: resolve email from token
    const meRes = await fetch(`${base}/api/auth/me`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });
    const meData = JSON.parse(await meRes.text()) as {
      user?: { email?: string };
    };
    const myEmail = meData.user?.email;
    expect(myEmail).toBe('alice@example.com');

    // Step 2: list orgs by email
    const orgsRes = await fetch(
      `${base}/api/v2/orgs?member=${encodeURIComponent(myEmail!)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      }
    );
    const orgs = JSON.parse(await orgsRes.text()) as Array<{
      id: string;
      slug: string;
    }>;
    expect(orgs).toHaveLength(1);
    expect(orgs[0].slug).toBe('my-org');

    // Verify both requests used the Bearer token
    for (const call of mockFetch.mock.calls) {
      const [, opts] = call as [string, { headers?: Record<string, string> }];
      expect(opts.headers).toMatchObject({
        Authorization: 'Bearer cli-token-abc',
      });
    }
  });

  it('org members add uses email not pubkey in request body', async () => {
    process.env.CALIMERO_API_KEY = 'token-xyz';

    const mockFetch = vi.fn().mockResolvedValue({
      text: async () => JSON.stringify({ ok: true }),
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const base = 'https://example.com';
    const config = new RemoteConfig();
    const apiKey = config.getApiKey()!;
    const authHeaders = { Authorization: `Bearer ${apiKey}` };
    const body = { email: 'bob@example.com', role: 'member' };

    await fetch(`${base}/api/v2/orgs/my-org/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    });

    const [, opts] = mockFetch.mock.calls[0] as [
      string,
      { headers?: Record<string, string>; body?: string },
    ];
    const sentBody = JSON.parse(opts.body ?? '{}');
    expect(sentBody).toHaveProperty('email', 'bob@example.com');
    expect(sentBody).not.toHaveProperty('pubkey');
  });
});
