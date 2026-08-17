// @vitest-environment jsdom
/**
 * The post-mutation listing freshness window in lib/api.ts.
 *
 * GET /api/v2/bundles is cached at the edge and nothing invalidates it, so a
 * client that has just deleted (or pushed, or yanked) something can be shown a
 * listing that still contains it. That looked like the delete had failed. The
 * fix is client-side because Vercel has no purge API for plain functions: a
 * successful mutation makes this tab ask for `?fresh=1` for a short while, which
 * the handler answers with `no-store`.
 *
 * Routed at the axios adapter, same as api-refresh.test.ts, so nothing reaches
 * into module-private state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

const FRESH_UNTIL = 'app_registry_listing_fresh_until';

type Call = { url: string; method: string; params?: Record<string, unknown> };

let calls: Call[];
let status: number;
let api: typeof import('@/lib/api').api;

function stubAdapter(config: {
  url?: string;
  method?: string;
  params?: Record<string, unknown>;
}) {
  calls.push({
    url: String(config.url ?? ''),
    method: String(config.method ?? 'get'),
    params: config.params,
  });
  const res = { data: [], status, statusText: '', headers: {}, config };
  if (status >= 200 && status < 300) return Promise.resolve(res);
  const err = new Error(
    `Request failed with status code ${status}`
  ) as Error & {
    response?: unknown;
    isAxiosError?: boolean;
  };
  err.isAxiosError = true;
  err.response = res;
  return Promise.reject(err);
}

/** Params the Nth listing GET actually went out with. */
function listingParams(index = 0) {
  const listings = calls.filter(c => c.url === '/v2/bundles');
  return listings[index]?.params ?? {};
}

beforeEach(async () => {
  calls = [];
  status = 200;
  window.sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  axios.defaults.adapter = stubAdapter as never;
  vi.resetModules();
  api = (await import('@/lib/api')).api;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('listing reads outside the window', () => {
  it('are left cacheable', async () => {
    await api.get('/v2/bundles');
    expect(listingParams()).not.toHaveProperty('fresh');
  });

  it('are left cacheable after a read of something else', async () => {
    await api.get('/v2/orgs');
    await api.get('/v2/bundles');
    expect(listingParams()).not.toHaveProperty('fresh');
  });
});

describe('a mutation opens the window', () => {
  it.each([
    ['deleting a package', 'delete', '/v2/bundles/com.example.app'],
    ['deleting a version', 'delete', '/v2/bundles/com.example.app/1.0.0'],
    ['yanking a version', 'post', '/v2/bundles/com.example.app/1.0.0/yank'],
    ['pushing a bundle', 'post', '/v2/bundles/push-file'],
    ['an admin delete', 'delete', '/admin/packages/com.example.app'],
    ['an admin verify', 'patch', '/admin/packages/com.example.app'],
  ])('%s makes the next listing uncached', async (_label, method, url) => {
    await api.request({ method, url });
    await api.get('/v2/bundles');

    expect(listingParams()).toMatchObject({ fresh: '1' });
  });

  it('keeps the caller’s own params', async () => {
    await api.delete('/v2/bundles/com.example.app');
    await api.get('/v2/bundles', {
      params: { package: 'com.example.app', all_versions: 'true' },
    });

    expect(listingParams()).toEqual({
      package: 'com.example.app',
      all_versions: 'true',
      fresh: '1',
    });
  });

  it('covers a reload, not just the navigation after the delete', async () => {
    await api.delete('/v2/bundles/com.example.app');

    // A fresh module registry is what a reload looks like from here; the window
    // has to live somewhere that survives it.
    vi.resetModules();
    const reloaded = (await import('@/lib/api')).api;
    await reloaded.get('/v2/bundles');

    expect(listingParams()).toMatchObject({ fresh: '1' });
  });
});

describe('the window is not opened by', () => {
  it('a read', async () => {
    await api.get('/v2/bundles/com.example.app/1.0.0');
    await api.get('/v2/bundles');
    expect(listingParams()).not.toHaveProperty('fresh');
  });

  it('a mutation elsewhere in the API', async () => {
    await api.post('/v2/orgs', { id: 'org' });
    await api.get('/v2/bundles');
    expect(listingParams()).not.toHaveProperty('fresh');
  });

  it('a failed mutation', async () => {
    // 403, not 401: a 401 would send this through the refresh-and-retry path.
    status = 403;
    await expect(api.delete('/v2/bundles/com.example.app')).rejects.toThrow();

    status = 200;
    await api.get('/v2/bundles');
    expect(listingParams()).not.toHaveProperty('fresh');
  });
});

describe('the window expires', () => {
  it('so browsing goes back to the cached listing', async () => {
    vi.useFakeTimers();
    await api.delete('/v2/bundles/com.example.app');

    vi.advanceTimersByTime(89_000);
    await api.get('/v2/bundles');
    expect(listingParams(0)).toMatchObject({ fresh: '1' });

    vi.advanceTimersByTime(2_000);
    await api.get('/v2/bundles');
    expect(listingParams(1)).not.toHaveProperty('fresh');

    // And it stops re-reading a dead key.
    expect(window.sessionStorage.getItem(FRESH_UNTIL)).toBeNull();
  });
});
