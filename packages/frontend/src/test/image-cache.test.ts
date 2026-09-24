// @vitest-environment jsdom
/**
 * lib/imageCache — the full-size preview preloader.
 *
 * The lightbox's "opens instantly" depends on four properties here, each of
 * which fails silently in the browser: one request per URL no matter how many
 * tiles ask, a synchronous answer once the bytes are in, a failure that does
 * not stick, and a bound that revokes what it drops.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  preloadImage,
  cachedImageUrl,
  clearImageCache,
  preloadWhenIdle,
  mayPreloadInBackground,
  MAX_ENTRIES,
} from '@/lib/imageCache';

let fetchMock: ReturnType<typeof vi.fn>;
let created = 0;
let revoked: string[] = [];

beforeEach(() => {
  created = 0;
  revoked = [];
  fetchMock = vi.fn(
    async () =>
      new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);
  // jsdom implements neither.
  URL.createObjectURL = vi.fn(() => `blob:test/${++created}`);
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
});

afterEach(() => {
  clearImageCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('preloadImage', () => {
  it('fetches a URL once, however many callers ask', async () => {
    const [a, b] = await Promise.all([
      preloadImage('/img/1'),
      preloadImage('/img/1'),
    ]);
    await preloadImage('/img/1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toMatch(/^blob:/);
  });

  it('answers synchronously once the bytes are in, and not before', async () => {
    const p = preloadImage('/img/2');
    expect(cachedImageUrl('/img/2')).toBeNull();
    const url = await p;
    expect(cachedImageUrl('/img/2')).toBe(url);
  });

  it('never reports an unrequested URL as cached', () => {
    expect(cachedImageUrl('/never')).toBeNull();
  });

  it('forgets a failure, so the next call retries', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(preloadImage('/img/3')).rejects.toThrow(/500/);
    expect(cachedImageUrl('/img/3')).toBeNull();

    await expect(preloadImage('/img/3')).resolves.toMatch(/^blob:/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the session cookie (a pending asset is only visible to its owner)', async () => {
    await preloadImage('/img/4');
    expect(fetchMock).toHaveBeenCalledWith('/img/4', {
      credentials: 'same-origin',
    });
  });
});

describe('the bound', () => {
  it(`keeps at most ${MAX_ENTRIES} and revokes what it evicts`, async () => {
    for (let i = 0; i < MAX_ENTRIES + 2; i++) await preloadImage(`/img/${i}`);
    // The two oldest are gone, and their object URLs were released.
    expect(cachedImageUrl('/img/0')).toBeNull();
    expect(cachedImageUrl('/img/1')).toBeNull();
    expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
    expect(cachedImageUrl(`/img/${MAX_ENTRIES + 1}`)).not.toBeNull();
  });

  it('treats a READ as use, so what the lightbox is showing survives neighbours', async () => {
    for (let i = 0; i < MAX_ENTRIES; i++) await preloadImage(`/img/${i}`);
    // The lightbox opens the oldest one…
    expect(cachedImageUrl('/img/0')).not.toBeNull();
    // …then preloads a neighbour, which must evict something else.
    await preloadImage('/img/new');
    expect(cachedImageUrl('/img/0')).not.toBeNull();
    expect(cachedImageUrl('/img/1')).toBeNull();
  });
});

describe('preloadWhenIdle', () => {
  it('fetches the queue one at a time, in order', async () => {
    vi.useFakeTimers();
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(url);
      await Promise.resolve();
      inFlight--;
      return new Response(new Blob([new Uint8Array([1])]), { status: 200 });
    });

    preloadWhenIdle(['/a', '/b', '/c']);
    await vi.runAllTimersAsync();
    expect(order).toEqual(['/a', '/b', '/c']);
    expect(maxInFlight).toBe(1);
  });

  it('stops when cancelled', async () => {
    vi.useFakeTimers();
    const cancel = preloadWhenIdle(['/a', '/b']);
    cancel();
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('mayPreloadInBackground', () => {
  const withConnection = (c: object | undefined) =>
    Object.defineProperty(navigator, 'connection', {
      value: c,
      configurable: true,
    });
  afterEach(() => withConnection(undefined));

  it('runs by default', () => {
    withConnection(undefined);
    expect(mayPreloadInBackground()).toBe(true);
  });
  it('respects Save-Data', () => {
    withConnection({ saveData: true, effectiveType: '4g' });
    expect(mayPreloadInBackground()).toBe(false);
  });
  it('skips slow connections', () => {
    withConnection({ effectiveType: '2g' });
    expect(mayPreloadInBackground()).toBe(false);
    withConnection({ effectiveType: 'slow-2g' });
    expect(mayPreloadInBackground()).toBe(false);
    withConnection({ effectiveType: '3g' });
    expect(mayPreloadInBackground()).toBe(false);
    withConnection({ effectiveType: '4g' });
    expect(mayPreloadInBackground()).toBe(true);
  });
});
