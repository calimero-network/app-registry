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
        className='flex aspect-[16/9] max-h-[30rem] items-center justify-center rounded-2xl border border-line bg-ink/[0.02] text-[13px] text-neutral-300 transition-colors hover:border-line-strong'
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
          // No `allow-same-origin`: paired with `allow-scripts` it would let
          // the framed page break out of its sandbox.
          sandbox='allow-scripts allow-popups-to-escape-sandbox'
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
        <span className='inline-flex items-center gap-2 rounded-lg bg-black/75 px-4 py-2.5 text-[13px] font-medium text-white'>
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
          View application on web
        </span>
      </span>
    </a>
  );
}
