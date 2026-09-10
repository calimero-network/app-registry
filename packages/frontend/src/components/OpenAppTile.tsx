import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * "Open App" as a live window onto the deployed frontend.
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
        className='flex h-80 items-center justify-center rounded-xl border border-ink/[0.08] bg-ink/[0.02] text-[13px] text-neutral-300 transition-colors hover:border-ink/[0.16]'
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
      className='group relative block h-80 overflow-hidden rounded-xl border border-ink/[0.08] bg-ink/[0.02]'
    >
      {/* A flex box that centres the frame, rather than scaling it from a
          corner. The first attempt used `origin-top-left`, so the hover zoom
          grew toward the bottom-right and the whole preview slid off centre.
          Centring the child and letting `scale` use its default centre origin
          means the zoom happens about the middle, which is what "zoom in"
          should look like. */}
      <div className='absolute inset-0 flex items-center justify-center'>
        <iframe
          src={url}
          title={`${name} preview`}
          loading='lazy'
          // No `allow-same-origin`: paired with `allow-scripts` it would let
          // the framed page break out of its sandbox.
          sandbox='allow-scripts allow-popups-to-escape-sandbox'
          onLoad={() => setLoaded(true)}
          aria-hidden='true'
          tabIndex={-1}
          // Rendered at a desktop viewport and scaled down, so the app lays
          // itself out as it would on a real screen instead of collapsing to
          // its mobile breakpoint inside a short frame.
          // `transition-transform` explicitly, plus an explicit
          // `filter` transition: a bare `transition-[transform,filter]`
          // arbitrary value did not always survive Tailwind's parser here,
          // and the zoom snapped instantly. 700ms so the movement reads as
          // deliberate rather than twitchy.
          style={{
            transitionProperty: 'transform, filter',
            transitionDuration: '700ms',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className='pointer-events-none h-[900px] w-[1440px] flex-shrink-0 scale-[0.30] border-0 group-hover:scale-[0.34] group-hover:blur-[3px]'
        />
      </div>
      {!loaded && (
        <div className='absolute inset-0 animate-pulse bg-ink/[0.03]' />
      )}
      <span className='absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-500 ease-out group-hover:bg-black/45 group-hover:opacity-100'>
        <span className='inline-flex items-center gap-2 rounded-lg bg-black/75 px-4 py-2.5 text-[13px] font-medium text-white'>
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
          View application on web
        </span>
      </span>
    </a>
  );
}
