import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A preview opened full screen.
 *
 * The strip loads downscaled copies (see lib/image.ts), so this is the only
 * place the publisher's full-resolution file is ever fetched — and it is
 * fetched when someone actually asks to look at it, not eight times on page
 * load.
 *
 * ⚠️ IT RENDERS IN A PORTAL, NOT IN PLACE. The strip is a horizontally
 * scrolling flex row, which establishes a scroll container; an `inset-0`
 * overlay inside it is positioned against that container and clipped by its
 * `overflow-x: auto`, so the "full screen" view appeared as a dark band inside
 * one tile. It has to leave the subtree to cover the viewport.
 */

export interface LightboxItem {
  id: string;
  /** The FULL-size object. Deliberately not the thumbnail. */
  url: string;
  alt: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
}

export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = items.length;
  const item = items[index];

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      // Wraps, so arrowing off either end keeps working rather than dead-ending.
      onIndex((index + delta + count) % count);
    },
    [count, index, onIndex]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // Hold the page still underneath. Restoring the PREVIOUS value rather than
  // clearing it matters: something else may already have locked scrolling
  // (the username modal does), and clearing would hand it back early.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus into the dialog so Escape and the arrows reach it without the
  // viewer having to click first.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!item) return null;

  return createPortal(
    <div
      // A dialog, so a screen reader announces it as one and does not read the
      // page behind it as if it were still available.
      role='dialog'
      aria-modal='true'
      aria-label={item.alt || 'Preview'}
      data-testid='lightbox'
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8'
      // Clicking the backdrop closes; clicking the picture must not. The check
      // is on the event target rather than a stopPropagation on the figure,
      // which would also swallow the arrow buttons' clicks.
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        ref={closeRef}
        type='button'
        onClick={onClose}
        aria-label='Close preview'
        data-testid='lightbox-close'
        className='absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:right-5 sm:top-5'
      >
        <X className='h-5 w-5' />
      </button>

      {count > 1 && (
        <>
          <button
            type='button'
            onClick={() => step(-1)}
            aria-label='Previous'
            data-testid='lightbox-prev'
            className='absolute left-2 rounded-lg bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 sm:left-5'
          >
            <ChevronLeft className='h-6 w-6' />
          </button>
          <button
            type='button'
            onClick={() => step(1)}
            aria-label='Next'
            data-testid='lightbox-next'
            className='absolute right-2 rounded-lg bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 sm:right-5'
          >
            <ChevronRight className='h-6 w-6' />
          </button>
        </>
      )}

      <figure className='flex max-h-full min-w-0 flex-col items-center gap-3'>
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={item.url}
            controls
            autoPlay
            className='max-h-[80vh] max-w-full rounded-lg'
          />
        ) : (
          <img
            // ⚠️ KEYED ON THE ID. Without it React keeps the same <img> node
            // across a step and paints the OLD picture until the new bytes
            // arrive, so arrowing through a gallery shows the previous image
            // under the new caption.
            key={item.id}
            src={item.url}
            alt={item.alt}
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            // The one place the full-resolution file is wanted, so it is not
            // lazy and it is worth fetching at high priority.
            loading='eager'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ fetchpriority: 'high' } as any)}
            className='max-h-[80vh] w-auto max-w-full rounded-lg object-contain'
          />
        )}
        {(item.alt || count > 1) && (
          <figcaption className='flex items-center gap-3 text-[12.5px] text-white/70'>
            {item.alt && <span className='truncate'>{item.alt}</span>}
            {count > 1 && (
              <span className='flex-shrink-0 tabular-nums text-white/50'>
                {index + 1} / {count}
              </span>
            )}
          </figcaption>
        )}
      </figure>
    </div>,
    document.body
  );
}
