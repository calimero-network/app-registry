// @vitest-environment jsdom
/**
 * The 401 recovery path in lib/api.ts.
 *
 * Declared per-file rather than globally: vitest here has no test config, so
 * everything else runs under node, and this is the only suite needing a DOM.
 *
 * It has regressed twice: once by never retrying after a refused refresh, and
 * once by leaving a tab signed in because the refusal said "no token" rather
 * than "bad token". Both were invisible because nothing exercised it.
 *
 * Routing is stubbed at the axios adapter, which both the api instance and the
 * refresh-only instance inherit from axios.defaults, so no extra dependency and
 * no reaching into module-private state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

const FLAG = 'app_registry_authenticated';

type Route = (url: string) => { status: number; data?: unknown };

let route: Route;
let calls: string[];
let assign: ReturnType<typeof vi.fn>;
let api: typeof import('@/lib/api').api;

function stubAdapter(config: { url?: string; baseURL?: string }) {
  const url = String(config.url ?? '');
  calls.push(url);
  const { status, data } = route(url);
  const res = { data, status, statusText: '', headers: {}, config };
  if (status >= 200 && status < 300) return Promise.resolve(res);
  const err = new Error(
    `Request failed with status code ${status}`
  ) as Error & {
    response?: unknown;
    isAxiosError?: boolean;
    config?: unknown;
  };
  err.response = res;
  err.isAxiosError = true;
  err.config = config;
  return Promise.reject(err);
}

beforeEach(async () => {
  calls = [];
  window.sessionStorage.clear();
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { pathname: '/apps', search: '', assign },
    writable: true,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Inherited by every instance created after this point.
  axios.defaults.adapter = stubAdapter as never;
  vi.resetModules();
  api = (await import('@/lib/api')).api;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Refresh answers `refreshStatus`/`refreshError`; the data call 401s `failures` times. */
function scenario(opts: {
  refreshStatus: number;
  refreshError?: string;
  failures: number;
}) {
  let seen = 0;
  route = url => {
    if (url.includes('/auth/refresh')) {
      return {
        status: opts.refreshStatus,
        data: opts.refreshError ? { error: opts.refreshError } : {},
      };
    }
    seen++;
    return seen <= opts.failures
      ? { status: 401, data: { error: 'unauthorized' } }
      : { status: 200, data: { ok: true } };
  };
}

describe('401 recovery', () => {
  it('retries the original request after a successful refresh', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    scenario({ refreshStatus: 200, failures: 1 });

    const res = await api.get('/thing');
    expect(res.data).toEqual({ ok: true });
    expect(assign).not.toHaveBeenCalled();
  });

  it('retries after a refused refresh, since another tab may have renewed', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    scenario({
      refreshStatus: 401,
      refreshError: 'invalid_refresh_token',
      failures: 1,
    });

    // The losing tab of a rotation race: its own token is refused, but the
    // winner already installed fresh cookies, so the retry succeeds.
    const res = await api.get('/thing');
    expect(res.data).toEqual({ ok: true });
    expect(assign).not.toHaveBeenCalled();
  });

  it('signs out when the retry also fails', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    scenario({
      refreshStatus: 401,
      refreshError: 'invalid_refresh_token',
      failures: 99,
    });

    await expect(api.get('/thing')).rejects.toBeTruthy();
    expect(assign).toHaveBeenCalledWith(
      expect.stringContaining('/login?error=session_expired')
    );
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
  });

  it('signs out a tab that thought it was authenticated but holds no token', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    scenario({
      refreshStatus: 401,
      refreshError: 'no_refresh_token',
      failures: 99,
    });

    await expect(api.get('/thing')).rejects.toBeTruthy();
    // "No token" is as terminal as "bad token" once the tab believed it had one.
    expect(assign).toHaveBeenCalled();
  });

  it('leaves an anonymous visitor alone', async () => {
    scenario({
      refreshStatus: 401,
      refreshError: 'no_refresh_token',
      failures: 99,
    });

    await expect(api.get('/thing')).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the session when the refresh endpoint is unreachable', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    scenario({ refreshStatus: 500, failures: 99 });

    await expect(api.get('/thing')).rejects.toBeTruthy();
    // A 5xx says nothing about the session, so it must not sign anyone out.
    expect(assign).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLAG)).toBe('1');
  });

  it('refreshes once for concurrent 401s, not once per request', async () => {
    window.sessionStorage.setItem(FLAG, '1');
    let seen = 0;
    route = url => {
      if (url.includes('/auth/refresh')) return { status: 200, data: {} };
      seen++;
      return seen <= 3
        ? { status: 401, data: {} }
        : { status: 200, data: { ok: true } };
    };

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    // A single-use refresh token must not be spent three times over.
    expect(calls.filter(u => u.includes('/auth/refresh'))).toHaveLength(1);
  });
});
