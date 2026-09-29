import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * The sandbox for a given frame URL.
 *
 * The extra flag is granted on TWO conditions, and the URL is publisher-
 * supplied data, so both are checked rather than assumed:
 *
 *  1. The scheme is http(s). ⚠️ A `javascript:` URL PARSES, and its origin is
 *     the string "null", which does not equal this page's — so an origin
 *     comparison alone hands the flag to exactly the input that must never
 *     have it. `data:` is the same shape of hole. Nothing but a real web
 *     origin gets past here.
 *  2. That origin differs from this page's. `allow-scripts` plus
 *     `allow-same-origin` is a sandbox escape only when the framed document
 *     is same-origin WITH THE EMBEDDER, because it can then reach into this
 *     page and remove its own sandbox attribute.
 *
 * Anything else — a relative path, an unparseable string, an empty
 * `links.frontend` — falls back to the strict sandbox, which is the safe
 * answer to a URL we could not classify.
 */
export function sandboxFor(url: string): string {
  const BASE = 'allow-scripts allow-popups-to-escape-sandbox';
  try {
    const target = new URL(url, window.location.href);
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      return BASE;
    if (target.origin === window.location.origin) return BASE;
    return `${BASE} allow-same-origin`;
  } catch {
    return BASE;
  }
}

/**
 * "Open App" as a live window onto the deployed frontend.
 *
 * ⚠️ THE FRAME IS LIVE, NOT A SCREENSHOT. There is nothing built at deploy
 * time and nothing cached: the `src` below is fetched by the browser each
 * time this tile mounts, so a tile that looks wrong is the app loading
 * wrongly, never a stale picture of it.
 *
 * ⚠️ AND IT WAS LOADING WRONGLY — EVERY APP RENDERED AS A BLACK RECTANGLE.
 * The sandbox here omitted `allow-same-origin`, which does not merely
 * restrict the frame, it gives the document an OPAQUE origin: `localStorage`
 * then throws `SecurityError` on the first read rather than returning null.
 * Every Calimero app reads it while booting (the SDK looks for a session), so
 * React threw before its first render and left `#root` empty — and since the
 * apps set a dark `background` on `body` in CSS, what was left on screen was
 * the body colour and nothing else. Measured against all 18 published
 * frontends: 18 blank frames, one identical `SecurityError` each.
 *
 * None of the guards below fired, which is why it looked deliberate: the
 * document really did load, so `onLoad` ran, `loaded` went true, the timeout
 * was cleared and the fallback link never appeared.
 *
 * `allow-same-origin` is granted ONLY to a CROSS-ORIGIN frame — see
 * `sandboxFor`. The pairing that breaks a sandbox is `allow-scripts` plus
 * `allow-same-origin` on a document that is same-origin WITH THE EMBEDDER,
 * because the frame can then reach into this page and remove its own sandbox
 * attribute. A frame on another origin gets back only what an ordinary
 * cross-origin iframe has always had: its own storage, and no access here.
 *
 * ⚠️ AN IFRAME GIVES NO LOAD ERROR YOU CAN CATCH. `onError` does not fire when
 * a frame is refused: a site sending `X-Frame-Options: DENY` or a CSP
 * `frame-ancestors` renders a blank white box and `onLoad` may never run
 * either. Checked at the time of writing, the Calimero apps on Vercel send
 * neither header — but that is a per-app property, not a platform guarantee,
 * and one app adding a CSP would silently show an empty rectangle here. So
 * there is a timeout: if the frame has not reported a load, the tile falls
 * back to a plain link.
 *
 * ⚠️ THIS LOADS A THIRD-PARTY APP ON EVERY PAGE VIEW. It is `loading="lazy"`,
 * sandboxed, and `pointer-events: none` until clicked — otherwise scrolling
 * an app page runs someone else's code and eats scroll events.
 */
export function OpenAppTile({ url, name }: { url: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    timer.current = window.setTimeout(() => {
      setLoaded(l => {
        if (!l) setFailed(true);
        return l;
      });
    }, 6000);
    return () => window.clearTimeout(timer.current);
  }, [url]);

  if (failed) {
    return (
      <a
        href={url}
        target='_blank'
        rel='noreferrer noopener'
        data-testid='open-app-fallback'
        className='flex aspect-[16/9] max-h-[30rem] items-center justify-center rounded-2xl border border-line bg-ink/[0.02] text-[15px] text-neutral-300 transition-colors hover:border-line-strong'
      >
        <span className='inline-flex items-center gap-2'>
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
          View application on web
        </span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target='_blank'
      rel='noreferrer noopener'
      data-testid='open-app'
      aria-label={`View ${name} on the web`}
      className='group preview-stage relative block aspect-[16/9] max-h-[30rem] w-full overflow-hidden rounded-2xl border border-line bg-ink/[0.02]'
    >
      {/* The frame fills the tile edge to edge. It is rendered at a desktop
          viewport and scaled to COVER the container — see `.preview-frame` in
          index.css, which also explains why the scale is written as a real
          `transform` rather than a Tailwind `scale-*` utility (v4's utility
          emits the standalone `scale:` property, which a `transform`
          transition cannot tween, so the zoom snapped). */}
      <div className='absolute inset-0 flex items-center justify-center'>
        <iframe
          src={url}
          title={`${name} preview`}
          loading='lazy'
          // ⚠️ NOT A CONSTANT. Withholding `allow-same-origin` blanked every
          // app; granting it to a SAME-ORIGIN frame would break the sandbox.
          // See `sandboxFor`.
          sandbox={sandboxFor(url)}
          onLoad={() => setLoaded(true)}
          aria-hidden='true'
          tabIndex={-1}
          className='preview-frame pointer-events-none h-[900px] w-[1440px] flex-shrink-0 border-0'
        />
      </div>
      {!loaded && (
        <div className='absolute inset-0 animate-pulse bg-ink/[0.03]' />
      )}
      {/* `preview-cta` is what makes this visible on a touch device, where
          there is no hover to reveal it — see `index.css`. */}
      <span className='preview-cta absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-500 ease-out group-hover:bg-black/45 group-hover:opacity-100'>
        <span className='inline-flex items-center gap-2 rounded-lg bg-black/75 px-4 py-2.5 text-[15px] font-medium text-white'>
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
          View application on web
        </span>
      </span>
    </a>
  );
}
