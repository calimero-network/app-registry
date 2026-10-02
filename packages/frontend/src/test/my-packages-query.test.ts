// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

type Call = { url: string; params?: Record<string, unknown> };

let calls: Call[];
let getMyPackages: typeof import('@/lib/api').getMyPackages;

function stubAdapter(config: {
  url?: string;
  params?: Record<string, unknown>;
}) {
  calls.push({ url: String(config.url ?? ''), params: config.params });
  const data =
    config.params?.mine === '1'
      ? [{ package: 'com.a', appVersion: '1.0.0', metadata: {} }]
      : [
          { package: 'com.a', appVersion: '1.0.0', metadata: {} },
          { package: 'com.b', appVersion: '2.0.0', metadata: {} },
        ];
  return Promise.resolve({
    data,
    status: 200,
    statusText: '',
    headers: {},
    config,
  });
}

beforeEach(async () => {
  calls = [];
  window.sessionStorage.clear();
  axios.defaults.adapter = stubAdapter as never;
  vi.resetModules();
  getMyPackages = (await import('@/lib/api')).getMyPackages;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMyPackages', () => {
  it('asks for the signed-in account and the public username, never an email', async () => {
    const result = await getMyPackages({ username: 'carol' });

    const params = calls
      .filter(c => c.url === '/v2/bundles')
      .map(c => c.params);
    expect(params).toEqual([{ mine: '1' }, { author: 'carol' }]);
    expect(result.map(app => app.id)).toEqual(['com.a', 'com.b']);
  });

  it('still lists the account’s packages when it has no username', async () => {
    const result = await getMyPackages({ username: null });

    const params = calls
      .filter(c => c.url === '/v2/bundles')
      .map(c => c.params);
    expect(params).toEqual([{ mine: '1' }]);
    expect(result).toHaveLength(1);
  });
});
