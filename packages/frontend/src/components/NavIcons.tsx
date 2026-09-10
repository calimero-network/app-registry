/**
 * Rail icons.
 *
 * Hand-drawn rather than pulled from a second icon set. The app already
 * depends on lucide in ~20 places, and shipping a whole second library for
 * five glyphs is a lot of bytes for a cosmetic change — these are five inline
 * SVGs in one file, no dependency, and they can be redrawn without touching
 * anything else.
 *
 * All five are built on the same 24px grid with a 1.6 stroke and square-ish
 * geometry, so the rail reads as one set instead of five borrowed marks.
 * `currentColor` throughout, so the active/hover colours in Layout apply
 * without the icons knowing about them.
 */

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/** A node with its four peers — the shape the whole network rests on. */
export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx='12' cy='12' r='2.6' />
      <circle cx='5' cy='5.5' r='1.7' />
      <circle cx='19' cy='5.5' r='1.7' />
      <circle cx='5' cy='18.5' r='1.7' />
      <circle cx='19' cy='18.5' r='1.7' />
      <path d='M6.4 6.9 9.9 10M17.6 6.9 14.1 10M6.4 17.1 9.9 14M17.6 17.1 14.1 14' />
    </svg>
  );
}

/** A grid of tiles with one lifted out — browsing a shelf. */
export function ExploreIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x='3' y='3' width='7' height='7' rx='2' />
      <rect x='3' y='14' width='7' height='7' rx='2' />
      <rect x='14' y='14' width='7' height='7' rx='2' />
      <rect x='13.4' y='2.4' width='8.2' height='8.2' rx='2.4' />
      <path d='M15.8 6.5h3.4M17.5 4.8v3.4' />
    </svg>
  );
}

/** Two figures, one behind the other. */
export function DevelopersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx='9.5' cy='8' r='3.1' />
      <path d='M3.8 19.4a5.9 5.9 0 0 1 11.4 0' />
      <path d='M16.2 5.4a3.1 3.1 0 0 1 0 5.6' />
      <path d='M17.6 14.2a5.9 5.9 0 0 1 2.7 5.2' />
    </svg>
  );
}

/** A package with an arrow going into it. */
export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d='M4 8.6 12 4.2l8 4.4v7.2L12 20.2 4 15.8Z' />
      <path d='M4 8.6 12 13l8-4.4M12 13v7.2' />
      <path d='M12 10.4V5.6M10.2 7.2 12 5.4l1.8 1.8' />
    </svg>
  );
}

/** An open manual. */
export function DocsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d='M12 6.6C10.4 5.3 8.4 4.7 5.4 4.7A1.4 1.4 0 0 0 4 6.1v11.2a1.4 1.4 0 0 0 1.4 1.4c3 0 5 .6 6.6 1.9' />
      <path d='M12 6.6c1.6-1.3 3.6-1.9 6.6-1.9A1.4 1.4 0 0 1 20 6.1v11.2a1.4 1.4 0 0 1-1.4 1.4c-3 0-5 .6-6.6 1.9' />
      <path d='M12 6.6v14' />
    </svg>
  );
}
