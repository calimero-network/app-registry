import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * The "Get started" gallery: poster tiles, not link rows.
 *
 * Each card is one flat graphic with the words set over it — the shape a
 * printed poster has — rather than an icon in a box beside a paragraph. The
 * whole tile is the artwork, so the radius is on the card and the art bleeds
 * to every edge of it.
 *
 * ⚠️ THE POSTER PALETTES ARE DELIBERATELY THEME-INDEPENDENT. Every other
 * surface in this app swaps with the theme through variables; these do not.
 * A poster is a printed object — it keeps its own paper and its own ink in
 * both themes, and hard-coding near-black type on a pastel ground is the only
 * way the text is guaranteed to stay legible on artwork this saturated.
 *
 * ⚠️ NOT the brand lime. The accent already means something specific in this
 * product (installed, verified, selected), and five green posters would both
 * flatten that and make the page one colour. These are pastels chosen to be
 * distinguishable from each other at thumbnail size.
 */

export type Poster = {
  /** Chosen by variant, not by prop: a caller cannot invent a sixth palette. */
  art: PosterVariant;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  /** In-app routes go through the router; anything else opens a tab. */
  internal?: boolean;
};

type PosterVariant = 'desktop' | 'docs' | 'publish' | 'explore' | 'source';

type Palette = {
  /** Two paper tones, top-left to bottom-right. */
  from: string;
  to: string;
  /** The one saturated shape colour. */
  mark: string;
  /** Line work and type. Near-black, never pure. */
  ink: string;
};

const PALETTES: Record<PosterVariant, Palette> = {
  desktop: { from: '#dfe3fb', to: '#c3caf6', mark: '#5b6ad0', ink: '#1c1f34' },
  docs: { from: '#fde3d6', to: '#f9cdb8', mark: '#d97449', ink: '#33211a' },
  publish: { from: '#efdcf7', to: '#e0c4ef', mark: '#9a5cc0', ink: '#2a1c33' },
  explore: { from: '#d6ecf7', to: '#b9dff2', mark: '#3d8bb5', ink: '#152730' },
  source: { from: '#f7e7c7', to: '#efd6a4', mark: '#b58432', ink: '#312716' },
};

export function PosterCard({ poster }: { poster: Poster }) {
  const p = PALETTES[poster.art];

  const inner = (
    <>
      <PosterArt variant={poster.art} palette={p} />

      {/* The type sits on the artwork. A scrim under it rather than a solid
          band: the poster has to stay one image, but a title over a busy
          corner is unreadable without some help. */}
      <span
        aria-hidden='true'
        className='absolute inset-x-0 bottom-0 h-2/3'
        style={{
          background: `linear-gradient(to top, ${p.from}f2 8%, ${p.from}b8 45%, transparent 100%)`,
        }}
      />

      <span className='relative flex h-full flex-col justify-end gap-1 p-5'>
        <span
          className='text-[10.5px] font-semibold uppercase tracking-[0.14em]'
          style={{ color: p.mark }}
        >
          {poster.eyebrow}
        </span>
        <span
          className='flex items-center gap-1.5 text-[17px] font-semibold leading-tight'
          style={{ color: p.ink }}
        >
          {poster.title}
          <ArrowUpRight
            className='h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
            aria-hidden='true'
          />
        </span>
        <span
          className='max-w-[26ch] text-[12.5px] font-light leading-relaxed'
          style={{ color: p.ink, opacity: 0.72 }}
        >
          {poster.body}
        </span>
      </span>
    </>
  );

  // `overflow-hidden` on the anchor is what actually clips the artwork to the
  // radius — the SVG is a rectangle and would otherwise square off the corners.
  const className =
    'group relative flex aspect-[4/3] flex-col overflow-hidden rounded-2xl ' +
    'transition-transform duration-300 ease-out hover:-translate-y-0.5 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60';

  if (poster.internal) {
    return (
      <Link to={poster.href} data-testid='promo-tile' className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <a
      href={poster.href}
      target='_blank'
      rel='noreferrer'
      data-testid='promo-tile'
      className={className}
    >
      {inner}
    </a>
  );
}

/**
 * One flat composition per variant.
 *
 * Static: the hero already runs a timeline, and five more looping graphics on
 * the same screen is both noise and five more permanently live animations.
 */
function PosterArt({
  variant,
  palette: p,
}: {
  variant: PosterVariant;
  palette: Palette;
}) {
  return (
    <svg
      viewBox='0 0 240 180'
      preserveAspectRatio='xMidYMid slice'
      className='absolute inset-0 h-full w-full'
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={`poster-${variant}`} x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stopColor={p.from} />
          <stop offset='100%' stopColor={p.to} />
        </linearGradient>
      </defs>
      <rect width='240' height='180' fill={`url(#poster-${variant})`} />
      {variant === 'desktop' && <DesktopPoster p={p} />}
      {variant === 'docs' && <DocsPoster p={p} />}
      {variant === 'publish' && <PublishPoster p={p} />}
      {variant === 'explore' && <ExplorePoster p={p} />}
      {variant === 'source' && <SourcePoster p={p} />}
    </svg>
  );
}

/** A screen, opened, with one tile lit inside it. */
function DesktopPoster({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx='196' cy='34' r='46' fill={p.mark} opacity='0.16' />
      <rect
        x='52'
        y='26'
        width='136'
        height='84'
        rx='8'
        fill='#ffffff'
        opacity='0.55'
      />
      <rect
        x='52'
        y='26'
        width='136'
        height='84'
        rx='8'
        fill='none'
        stroke={p.mark}
        strokeWidth='2'
        opacity='0.7'
      />
      <line
        x1='52'
        y1='44'
        x2='188'
        y2='44'
        stroke={p.mark}
        strokeWidth='1.5'
        opacity='0.45'
      />
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x={66 + i * 42}
          y='58'
          width='30'
          height='30'
          rx='9'
          fill={i === 1 ? p.mark : p.ink}
          opacity={i === 1 ? '0.9' : '0.14'}
        />
      ))}
      <rect x='96' y='114' width='48' height='6' rx='3' fill={p.ink} opacity='0.18' />
    </g>
  );
}

/** An open manual, one page carrying a code block. */
function DocsPoster({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx='44' cy='40' r='40' fill={p.mark} opacity='0.14' />
      <path
        d='M120 40c-16-12-34-14-56-12v78c22-2 40 0 56 12z'
        fill='#ffffff'
        opacity='0.6'
      />
      <path
        d='M120 40c16-12 34-14 56-12v78c-22-2-40 0-56 12z'
        fill='#ffffff'
        opacity='0.45'
      />
      <path
        d='M120 40c-16-12-34-14-56-12v78c22-2 40 0 56 12c16-12 34-14 56-12V28c-22-2-40 0-56 12z'
        fill='none'
        stroke={p.mark}
        strokeWidth='2'
        strokeLinejoin='round'
        opacity='0.7'
      />
      <line x1='120' y1='40' x2='120' y2='118' stroke={p.mark} strokeWidth='1.5' opacity='0.5' />
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x='76'
          y={52 + i * 12}
          width={i === 2 ? 20 : 32}
          height='4'
          rx='2'
          fill={p.ink}
          opacity='0.2'
        />
      ))}
      <rect x='132' y='50' width='36' height='30' rx='5' fill={p.mark} opacity='0.8' />
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x='138'
          y={57 + i * 8}
          width={[22, 14, 18][i]}
          height='3.4'
          rx='1.7'
          fill='#ffffff'
          opacity='0.85'
        />
      ))}
    </g>
  );
}

/** A bundle leaving the machine — signed, versioned, on its way up. */
function PublishPoster({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx='60' cy='132' r='52' fill={p.mark} opacity='0.14' />
      <path
        d='M120 22l40 24v48l-40 24-40-24V46z'
        fill='#ffffff'
        opacity='0.55'
      />
      <path
        d='M120 22l40 24v48l-40 24-40-24V46z'
        fill='none'
        stroke={p.mark}
        strokeWidth='2'
        strokeLinejoin='round'
        opacity='0.75'
      />
      <path
        d='M80 46l40 24 40-24M120 70v48'
        fill='none'
        stroke={p.mark}
        strokeWidth='1.6'
        opacity='0.5'
      />
      <circle cx='120' cy='70' r='13' fill={p.mark} opacity='0.9' />
      <path
        d='M114 70l4.5 4.5L127 66'
        fill='none'
        stroke='#ffffff'
        strokeWidth='2.6'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x={186}
          y={44 + i * 14}
          width={[30, 22, 26][i]}
          height='5'
          rx='2.5'
          fill={p.ink}
          opacity='0.16'
        />
      ))}
    </g>
  );
}

/** A shelf of apps, one picked out. */
function ExplorePoster({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx='206' cy='140' r='48' fill={p.mark} opacity='0.16' />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const on = i === 4;
        return (
          <g key={i}>
            <rect
              x={44 + col * 56}
              y={30 + row * 56}
              width='44'
              height='44'
              rx='13'
              fill={on ? p.mark : '#ffffff'}
              opacity={on ? '0.92' : '0.55'}
            />
            <rect
              x={44 + col * 56}
              y={30 + row * 56}
              width='44'
              height='44'
              rx='13'
              fill='none'
              stroke={p.mark}
              strokeWidth='1.6'
              opacity='0.55'
            />
          </g>
        );
      })}
      <circle
        cx='150'
        cy='108'
        r='26'
        fill='none'
        stroke={p.ink}
        strokeWidth='3'
        opacity='0.28'
      />
      <line
        x1='169'
        y1='127'
        x2='184'
        y2='142'
        stroke={p.ink}
        strokeWidth='3'
        strokeLinecap='round'
        opacity='0.28'
      />
    </g>
  );
}

/** Peers, connected directly — the thing the code in the repo actually does. */
function SourcePoster({ p }: { p: Palette }) {
  const nodes = [
    [72, 46],
    [168, 38],
    [196, 108],
    [104, 122],
    [40, 100],
  ];
  return (
    <g>
      <circle cx='120' cy='40' r='54' fill={p.mark} opacity='0.14' />
      {nodes.map(([x1, y1], i) =>
        nodes.slice(i + 1).map(([x2, y2], j) => (
          <line
            key={`${i}-${j}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={p.ink}
            strokeWidth='1.4'
            opacity='0.18'
          />
        ))
      )}
      {nodes.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={i === 0 ? 17 : 13} fill='#ffffff' opacity='0.6' />
          <circle
            cx={cx}
            cy={cy}
            r={i === 0 ? 17 : 13}
            fill={i === 0 ? p.mark : 'none'}
            opacity={i === 0 ? '0.9' : '1'}
            stroke={p.mark}
            strokeWidth='2'
          />
        </g>
      ))}
    </g>
  );
}
