import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PosterCard, type Poster } from './PosterCard';

/**
 * "Get started" — one poster at a time, full width, advancing on its own.
 *
 * The slides are stacked, not laid out in a row: the outgoing one fades and
 * settles back while the incoming one fades up and drifts forward, so a step
 * reads as a dissolve rather than as a strip of paper being dragged past. All
 * five stay mounted, which keeps the SVG artwork drawn once instead of on
 * every step, and means the crossfade has something to cross to.
 *
 * ⚠️ AUTO-ADVANCING CONTENT NEEDS A WAY TO STOP (WCAG 2.2.2), and a carousel
 * that keeps moving while you are reading it is the reason people hate
 * carousels. Three things pause it: hovering, focusing anything inside it, and
 * pressing an arrow — a manual step means you are driving, so it does not
 * start itself again. It also never starts at all for a viewer who asked for
 * reduced motion; the arrows are the whole interface for them.
 *
 * ⚠️ THE OFF-SCREEN SLIDES ARE STILL IN THE DOM, stacked directly on top of
 * the visible one. Without `pointer-events-none` the click lands on whichever
 * slide is last in source order rather than the one being looked at, and
 * without `tabIndex={-1}` / `aria-hidden` tabbing walks through four links
 * nobody can see. `PosterCard` takes `active` for exactly that.
 */

const DWELL_MS = 6500;

export function PosterGallery({ posters }: { posters: Poster[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Set once an arrow or a dot is used, and never cleared: after a manual
  // step the viewer is driving.
  const [manual, setManual] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const count = posters.length;
  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  useEffect(() => {
    if (paused || manual || reduced.current || count < 2) return;
    const t = window.setInterval(
      () => setIndex(i => (i + 1) % count),
      DWELL_MS
    );
    return () => window.clearInterval(t);
  }, [paused, manual, count]);

  const step = (delta: number) => {
    setManual(true);
    go(index + delta);
  };

  if (count === 0) return null;

  return (
    <div
      data-testid='poster-gallery'
      className='relative'
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription='carousel'
      aria-label='Get started'
    >
      {/* The box owns the height; the slides fill it absolutely. An
          aspect-ratio on the wrapper rather than on each slide keeps the
          gallery exactly one slide tall however many are stacked in it. */}
      <div className='relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:aspect-[21/9]'>
        {posters.map((poster, i) => {
          const on = i === index;
          return (
            <div
              key={poster.title}
              className={`absolute inset-0 transition-all duration-700 ease-out ${
                on
                  ? 'z-10 scale-100 opacity-100 blur-0'
                  : 'pointer-events-none z-0 scale-[1.04] opacity-0 blur-[2px]'
              }`}
              role='group'
              aria-roledescription='slide'
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={on ? undefined : true}
            >
              <PosterCard poster={poster} active={on} />
            </div>
          );
        })}
      </div>

      {/* Both controls in one corner, clear of the copy. Centred on the
          edges they sat on top of the title — the type runs along the left of
          every slide, which is exactly where a left arrow wants to be. */}
      <div className='absolute right-4 top-4 z-20 flex gap-2'>
        <Arrow side='left' onClick={() => step(-1)} />
        <Arrow side='right' onClick={() => step(1)} />
      </div>

      <div className='mt-3 flex items-center justify-center gap-2'>
        {posters.map((poster, i) => (
          <button
            key={poster.title}
            type='button'
            onClick={() => {
              setManual(true);
              go(i);
            }}
            aria-label={`Show ${poster.title}`}
            aria-current={i === index}
            data-testid='poster-dot'
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index
                ? 'w-6 bg-ink/[0.45]'
                : 'w-1.5 bg-ink/[0.16] hover:bg-ink/[0.3]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Arrow({
  side,
  onClick,
}: {
  side: 'left' | 'right';
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      data-testid={`poster-${side}`}
      // ⚠️ The wrapper carries `z-20`, ABOVE THE SLIDES. The active slide is
      // `z-10` and its scrim is `absolute inset-0`, so a control at the
      // default stacking level sits underneath it: visible, hoverable, and
      // completely unclickable — the click lands on the poster link behind it
      // and opens whatever that slide points at.
      //
      // Dark ink on a translucent white pill: the posters are light in both
      // themes, so the control cannot follow the page theme or it disappears
      // against the artwork on one of them.
      className='flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-[#1c1f34] shadow-sm backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60'
    >
      <Icon className='h-5 w-5' aria-hidden='true' />
    </button>
  );
}
