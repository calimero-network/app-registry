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
        className='flex h-64 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-[13px] text-neutral-300 transition-colors hover:border-white/[0.16]'
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
      className='group relative block h-64 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]'
    >
      <iframe
        src={url}
        title={`${name} preview`}
        loading='lazy'
        // No `allow-same-origin`: with `allow-scripts` the pair would let the
        // framed page reach out of its sandbox.
        sandbox='allow-scripts allow-popups-to-escape-sandbox'
        onLoad={() => setLoaded(true)}
        aria-hidden='true'
        tabIndex={-1}
        className='pointer-events-none h-[142%] w-[142%] origin-top-left scale-[0.703] border-0 transition-[filter,transform] duration-300 group-hover:scale-[0.77] group-hover:blur-[2px]'
      />
      {!loaded && (
        <div className='absolute inset-0 animate-pulse bg-white/[0.03]' />
      )}
      <span className='absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/45 group-hover:opacity-100'>
        <span className='inline-flex items-center gap-2 rounded-lg bg-black/70 px-3.5 py-2 text-[13px] font-medium text-neutral-100'>
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
          View application on web
        </span>
      </span>
    </a>
  );
}
