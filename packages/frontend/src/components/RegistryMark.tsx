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
        // Indented past the glyph so the label sits under the WORDMARK
        // rather than under the mark — the glyph occupies roughly the first
        // 52px of the asset, and a label starting at x=0 reads as a caption
        // for the icon instead of a lockup with the name.
        // ⚠️ CONTRAST ALONE COULD NOT FIX THIS. The label was 8px — and 7px
        // in the mobile bar — so however dark the green got, it rendered as a
        // smudge rather than as words. Deepening the ink from #5f9400 to
        // #3f6a00 took it from 3.3:1 to 5.7:1 and it still looked wrong,
        // because the failure was SIZE. 11px at weight 800 is what makes it
        // read; the colour change matters, but only once the glyphs are big
        // enough to carry it.
        //
        // ⚠️ The left margin moves WITH the size. The label is indented past
        // the shield so it sits under the WORDMARK rather than under the
        // glyph; grow the type without pulling the indent back and the
        // lockup drifts right of the letters it belongs to.
        className={`font-extrabold uppercase leading-none text-brand-600 ${
          compact
            ? '-mt-[3px] ml-[38px] text-[9.5px] tracking-[0.02em]'
            : '-mt-[4px] ml-[47px] text-[11px] tracking-[0.03em]'
        }`}
      >
        App Registry
      </span>
    </span>
  );
}
