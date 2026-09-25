import wordmark from '@/assets/brand/calimero-wordmark.svg';

/**
 * The Calimero wordmark with the product named beside it — the lockup
 * calimero.network's family uses for its products (Cloud's header reads
 * "calimero | CLOUD"): the Calimero mark stays the Calimero mark, and the
 * product is a subordinate label behind a hairline, set as a lime eyebrow.
 *
 * Mechanics worth knowing:
 *
 *  - The wordmark is the landing's own asset, drawn white, loaded as an
 *    <img>. In light mode `--logo-filter` flattens it to near-black ink.
 *  - The label is TEXT, not part of the SVG, so it can take the accent-text
 *    token: the lime on charcoal, a deep green on paper (the lime itself is
 *    ~1.2:1 on white). e2e/registry.spec.ts measures it against the header.
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
      className={`inline-flex items-center ${compact ? 'gap-2.5' : 'gap-2.5 min-[1100px]:gap-3'} ${className ?? ''}`}
      data-testid='registry-mark'
    >
      <img
        src={wordmark}
        alt='Calimero'
        width={180}
        height={32}
        className={`${compact ? 'h-[22px]' : 'h-[22px] min-[1100px]:h-[28px]'} block w-auto`}
        style={{ filter: 'var(--logo-filter)' }}
      />
      <span
        className={`border-l border-line-strong font-normal uppercase leading-none whitespace-nowrap text-brand-600 ${
          compact
            ? 'py-1 pl-2.5 text-[12.5px] tracking-[0.22em]'
            : 'py-1 pl-2.5 text-[12.5px] tracking-[0.22em] lg:py-1.5 lg:pl-3.5 lg:text-[16px] lg:tracking-[0.28em]'
        }`}
      >
        App Registry
      </span>
    </span>
  );
}
