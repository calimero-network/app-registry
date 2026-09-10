/**
 * The registry's own lockup: a glyph, "App Registry", and "by Calimero".
 *
 * The rail used to show the bare Calimero wordmark — the same mark every
 * other Calimero property uses — so nothing on screen said which product you
 * were looking at.
 *
 * Drawn inline rather than as an .svg asset for one specific reason: the
 * existing logo is forced white with `filter: brightness(0) invert(1)`, which
 * flattens anything coloured into a silhouette. Inline SVG uses
 * `currentColor` and the brand accent directly, so it needs no filter and
 * keeps the accent.
 *
 * Two sizes because the mark appears at three places and the two-line lockup
 * is illegible small: `full` for the rail and footer, `compact` for the
 * mobile bar.
 */
export function RegistryMark({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const glyph = (
    <svg
      viewBox='0 0 24 24'
      className='h-[22px] w-[22px] flex-shrink-0'
      aria-hidden='true'
      fill='none'
    >
      {/* A bundle: three stacked services signed as one. */}
      <rect
        x='3.2'
        y='3.2'
        width='17.6'
        height='17.6'
        rx='5'
        className='stroke-brand-600'
        strokeWidth='1.5'
      />
      <path
        d='M7.6 9.4h8.8M7.6 12.6h8.8M7.6 15.8h5.2'
        className='stroke-brand-600'
        strokeWidth='1.5'
        strokeLinecap='round'
      />
    </svg>
  );

  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
        {glyph}
        <span className='text-[13px] font-semibold tracking-tight text-neutral-100'>
          App Registry
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      {glyph}
      <span className='flex flex-col leading-none'>
        <span className='text-[13.5px] font-semibold tracking-tight text-neutral-100'>
          App Registry
        </span>
        <span className='mt-[3px] text-[10.5px] font-light tracking-wide text-neutral-500'>
          by Calimero
        </span>
      </span>
    </span>
  );
}
