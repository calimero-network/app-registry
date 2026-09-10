import calimeroLogo from '@/assets/calimero-logo.svg';

/**
 * The Calimero wordmark with "APP REGISTRY" tucked underneath, overlapping
 * slightly — the same lockup docs.calimero.network uses for "DOCS".
 *
 * The first attempt drew a bespoke glyph and set the product name beside it.
 * That invented a second brand: the point of this lockup is that the Calimero
 * mark stays the Calimero mark and the product name is a subordinate label
 * hanging off it, not a peer.
 *
 * Mechanics worth knowing:
 *
 *  - The logo is an <img> forced white with `brightness(0) invert(1)`, which
 *    flattens any colour to a silhouette. That is fine for the wordmark, but
 *    it means the green label CANNOT be part of that SVG — it has to be text
 *    beside it, or the filter eats the colour.
 *  - In light mode that filter would render the wordmark white on white, so
 *    it is inverted back under `[data-theme='light']`.
 *  - The overlap is a negative margin plus letter-spacing, sized per variant:
 *    the label has to sit under the wordmark's baseline without colliding
 *    with its descenders.
 */
export function RegistryMark({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const compact = variant === 'compact';

  return (
    <span
      className={`inline-flex flex-col items-start ${className ?? ''}`}
      data-testid='registry-mark'
    >
      <img
        src={calimeroLogo}
        alt='Calimero'
        className={`${compact ? 'h-[18px]' : 'h-[22px]'} block opacity-95 dark:opacity-95`}
        // brightness(0) invert(1) => white, for the dark ground. Light mode
        // flips it back to near-black in index.css via [data-theme='light'].
        style={{ filter: 'var(--logo-filter)' }}
      />
      <span
        className={`font-bold uppercase leading-none text-brand-600 ${
          compact
            ? '-mt-[2px] text-[7px] tracking-[0.06em]'
            : '-mt-[3px] text-[8px] tracking-[0.08em]'
        }`}
      >
        App Registry
      </span>
    </span>
  );
}
