import { useState } from 'react';
import { cn, fallbackHue } from '@/lib/utils';

/**
 * An app's launcher icon, or a deterministic stand-in.
 *
 * The icon is `metadata.icon` — a `data:image/png;base64,…` URI carried inside
 * the signed bundle, the same field tauri-app reads when it writes a launcher
 * into ~/Applications. Three published bundles have none, so the fallback is a
 * normal state, not an error state: a broken-image glyph in a storefront reads
 * as "this app is broken" rather than "this app has no icon".
 *
 * The hue is derived from the package id, so the same app keeps the same tint
 * on every render and every machine rather than flickering between reloads.
 *
 * `width`/`height` are set explicitly and decoding is async: a listing inlines
 * twenty base64 PNGs, and without intrinsic sizing every one of them reflows
 * the grid as it decodes.
 */
export function AppIcon({
  icon,
  name,
  seed,
  size = 56,
  className,
}: {
  icon?: string;
  name: string;
  seed: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const rounded = size >= 64 ? 'rounded-2xl' : 'rounded-xl';

  if (icon && !failed) {
    return (
      <img
        src={icon}
        alt=''
        aria-hidden='true'
        width={size}
        height={size}
        loading='lazy'
        decoding='async'
        onError={() => setFailed(true)}
        className={cn(
          rounded,
          'flex-shrink-0 object-cover bg-ink/[0.04] border border-ink/[0.08]',
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const hue = fallbackHue(seed);
  const letter = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <div
      aria-hidden='true'
      data-testid='app-icon-fallback'
      className={cn(
        rounded,
        'flex-shrink-0 grid place-items-center border border-ink/[0.08] font-semibold text-ink/80 select-none',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(140deg, hsl(${hue} 45% 28%), hsl(${(hue + 40) % 360} 45% 18%))`,
      }}
    >
      {letter}
    </div>
  );
}
