/**
 * Full-size preview images, fetched ahead of the click that shows them.
 *
 * The strip loads thumbnails (lib/image.ts), so opening a tile full screen
 * used to start a cold download of the publisher's original — up to 4MB,
 * proxied through a serverless function that buffers the whole object before
 * sending a byte — while the viewer looked at a black overlay.
 *
 * WHY BYTES IN MEMORY, NOT JUST `new Image()` TO WARM THE HTTP CACHE
 *
 * Warming the HTTP cache only helps when the response is cacheable, and a
 * pending asset is served `private` (and was `no-store` until recently) to
 * the one person who can see it — the owner, who opens their own screenshots
 * more than anyone. Holding the bytes as an object URL makes "already
 * loaded" a fact this module knows synchronously, independent of headers,
 * so the lightbox can paint on the very first frame instead of hoping the
 * browser decides to reuse something.
 *
 * ⚠️ BOUNDED. Originals are large; the cache keeps the most recently used
 * {@link MAX_ENTRIES} and revokes the rest. Revoking the URL of an <img> that
 * has already decoded does not blank it — the decoded bitmap is the element's
 * — so eviction never breaks what is on screen.
 */

/** Enough for one app's whole strip (the registry caps a package at 8). */
export const MAX_ENTRIES = 12;

interface Entry {
  /** Resolves to the object URL, or rejects if the fetch failed. */
  promise: Promise<string>;
  /** Set once the bytes are in and decoded. */
  objectUrl: string | null;
}

const entries = new Map<string, Entry>();

function touch(url: string, entry: Entry) {
  // Map iteration order is insertion order, so re-inserting marks it newest.
  entries.delete(url);
  entries.set(url, entry);
}

function evict() {
  while (entries.size > MAX_ENTRIES) {
    const [oldest, entry] = entries.entries().next().value as [string, Entry];
    entries.delete(oldest);
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
}

/**
 * Fetch `url` once and keep it. Concurrent and repeated calls share one
 * request. A failure is forgotten, so the next call tries again rather than
 * caching the error for the life of the tab.
 */
export function preloadImage(url: string): Promise<string> {
  const existing = entries.get(url);
  if (existing) {
    touch(url, existing);
    return existing.promise;
  }

  const entry: Entry = { promise: Promise.resolve(''), objectUrl: null };
  entry.promise = (async () => {
    // Same origin, so the session cookie rides along and a pending asset the
    // viewer owns is fetched with the same permission the <img> would have.
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`preload failed: ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    // Decode now, off the click path, so first paint in the lightbox does not
    // pay for it. Unsupported (older engines, jsdom) is not a failure.
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
    } catch {
      /* decode is an optimisation; the object URL is still good */
    }
    // Evicted while in flight: nobody will ever read this URL again.
    if (entries.get(url) !== entry) {
      URL.revokeObjectURL(objectUrl);
      return url;
    }
    entry.objectUrl = objectUrl;
    return objectUrl;
  })();
  entry.promise.catch(() => {
    if (entries.get(url) === entry) entries.delete(url);
  });

  entries.set(url, entry);
  evict();
  return entry.promise;
}

/**
 * The in-memory copy of `url` if it has fully arrived, else null. Synchronous
 * on purpose: the lightbox decides on its first render whether it can show
 * the full image straight away.
 */
export function cachedImageUrl(url: string): string | null {
  const entry = entries.get(url);
  if (!entry?.objectUrl) return null;
  // Being shown makes it the newest: the lightbox preloads neighbours right
  // after reading this, and those must evict something else, not the URL an
  // <img> has only just been handed.
  touch(url, entry);
  return entry.objectUrl;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Should background preloading run at all? Not for someone who asked the
 * browser to save data, nor on a connection where 4MB originals would
 * compete with the page they are looking at.
 */
export function mayPreloadInBackground(): boolean {
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return !/(^|-)2g$|^3g$/.test(conn.effectiveType ?? '');
}

/**
 * Preload `urls` one after another when the browser is idle. Sequential, so
 * background warming never holds more than one serverless read open at a
 * time. Returns a cancel function for an unmount mid-queue.
 */
export function preloadWhenIdle(urls: string[]): () => void {
  let cancelled = false;
  let handle: number | null = null;
  const w = window as IdleWindow;
  const schedule = (fn: () => void) => {
    handle = w.requestIdleCallback
      ? w.requestIdleCallback(fn, { timeout: 2000 })
      : window.setTimeout(fn, 200);
  };

  const queue = [...urls];
  const next = () => {
    if (cancelled) return;
    const url = queue.shift();
    if (!url) return;
    preloadImage(url)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) schedule(next);
      });
  };
  schedule(next);

  return () => {
    cancelled = true;
    if (handle === null) return;
    if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

/** Test hook: drop everything. */
export function clearImageCache() {
  for (const entry of entries.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  entries.clear();
}
