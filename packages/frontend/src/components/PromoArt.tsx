/**
 * Illustrations for the "Get started" shelf.
 *
 * Real drawings rather than a lucide glyph in a rounded box: these tiles are
 * the largest thing on the page after the hero, and a 20px icon at that size
 * reads as a placeholder. Inline SVG so they inherit `currentColor` and the
 * accent variable and therefore work in both themes with no second asset.
 *
 * Static on purpose. The hero already animates; three more moving things on
 * one screen is noise, and each of these would be another permanently running timeline.
 */

type ArtProps = { className?: string };

/** A desktop window with an app tile installed into it. */
export function DesktopArt({ className }: ArtProps) {
  return (
    <svg viewBox='0 0 120 80' className={className} aria-hidden='true'>
      <rect
        x='6'
        y='8'
        width='108'
        height='60'
        rx='7'
        fill='currentColor'
        opacity='0.05'
        stroke='var(--accent)'
        strokeOpacity='0.3'
      />
      <line
        x1='6'
        y1='20'
        x2='114'
        y2='20'
        stroke='var(--accent)'
        strokeOpacity='0.2'
      />
      <circle cx='14' cy='14' r='2' fill='var(--accent)' opacity='0.7' />
      <circle cx='21' cy='14' r='2' fill='currentColor' opacity='0.25' />
      {[0, 1, 2, 3].map(i => (
        <rect
          key={i}
          x={16 + (i % 4) * 24}
          y={30}
          width='18'
          height='18'
          rx='5'
          fill={i === 1 ? 'var(--accent)' : 'currentColor'}
          opacity={i === 1 ? '0.85' : '0.12'}
        />
      ))}
      {[0, 1, 2, 3].map(i => (
        <rect
          key={`l${i}`}
          x={18 + (i % 4) * 24}
          y={52}
          width='14'
          height='3'
          rx='1.5'
          fill='currentColor'
          opacity='0.18'
        />
      ))}
      <rect
        x='40'
        y='70'
        width='40'
        height='4'
        rx='2'
        fill='currentColor'
        opacity='0.12'
      />
    </svg>
  );
}

/** An open manual with a code block on the page. */
export function DocsArt({ className }: ArtProps) {
  return (
    <svg viewBox='0 0 120 80' className={className} aria-hidden='true'>
      <path
        d='M60 18C51 11 41 8 24 8a4 4 0 0 0-4 4v50a4 4 0 0 0 4 4c17 0 27 3 36 10'
        fill='currentColor'
        fillOpacity='0.05'
        stroke='var(--accent)'
        strokeOpacity='0.3'
        strokeLinejoin='round'
      />
      <path
        d='M60 18c9-7 19-10 36-10a4 4 0 0 1 4 4v50a4 4 0 0 1-4 4c-17 0-27 3-36 10'
        fill='currentColor'
        fillOpacity='0.05'
        stroke='var(--accent)'
        strokeOpacity='0.3'
        strokeLinejoin='round'
      />
      <line
        x1='60'
        y1='18'
        x2='60'
        y2='76'
        stroke='var(--accent)'
        strokeOpacity='0.25'
      />
      {[0, 1, 2].map(i => (
        <rect
          key={`a${i}`}
          x='30'
          y={26 + i * 9}
          width={i === 2 ? 14 : 22}
          height='3.5'
          rx='1.75'
          fill='currentColor'
          opacity='0.22'
        />
      ))}
      <rect
        x='68'
        y='26'
        width='26'
        height='22'
        rx='4'
        fill='var(--accent)'
        opacity='0.16'
      />
      {[0, 1, 2].map(i => (
        <rect
          key={`c${i}`}
          x='72'
          y={31 + i * 6}
          width={[16, 11, 14][i]}
          height='2.6'
          rx='1.3'
          fill='var(--accent)'
          opacity='0.7'
        />
      ))}
      {[0, 1].map(i => (
        <rect
          key={`b${i}`}
          x='68'
          y={54 + i * 8}
          width={i === 1 ? 16 : 24}
          height='3.5'
          rx='1.75'
          fill='currentColor'
          opacity='0.22'
        />
      ))}
    </svg>
  );
}
