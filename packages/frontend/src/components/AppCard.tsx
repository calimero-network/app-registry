import { Link } from 'react-router-dom';
import { BadgeCheck, Download } from 'lucide-react';
import { AppIcon } from './AppIcon';
import {
  cn,
  formatBytes,
  formatCategory,
  formatRelativeDate,
} from '@/lib/utils';
import type { AppSummary } from '@/types/api';

/**
 * The storefront card: icon, title, description, creator, date, category,
 * size, downloads.
 *
 * Every metadata row is conditional. `installSize` and `publishedAt` are null
 * for every bundle published before the metadata policy shipped, and the
 * description is absent on older ones — so the row renders what exists and
 * omits the rest, rather than printing "0 bytes" or "Invalid Date". A card
 * with nothing but a name is a legitimate outcome for a 2024 bundle.
 *
 * No entrance animation on purpose: these render twenty at a time, and a
 * staggered cascade on every filter keystroke is what made the old listing
 * feel unsettled.
 */
export function AppCard({
  app,
  size = 'default',
}: {
  app: AppSummary;
  size?: 'default' | 'compact';
}) {
  const bytes = formatBytes(app.installSize);
  const when = formatRelativeDate(app.publishedAt);
  const category = formatCategory(app.category);
  const large = size === 'default';

  return (
    <Link
      to={`/apps/${encodeURIComponent(app.id)}`}
      data-testid='app-card'
      data-package={app.package_name}
      className={cn(
        'group flex gap-4 border border-line bg-[var(--surface)]',
        'transition-colors duration-150 hover:border-brand-600/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60',
        large ? 'p-5' : 'p-3.5'
      )}
    >
      <AppIcon
        icon={app.icon}
        name={app.name}
        seed={app.package_name}
        size={large ? 56 : 40}
      />

      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1.5'>
          <h3
            className={cn(
              'truncate font-bold text-neutral-100 transition-colors group-hover:text-brand-600',
              large ? 'text-[19px]' : 'text-[16px]'
            )}
          >
            {app.name}
          </h3>
        </div>

        {/* The package id, with the badge on it. The registry's claim is
            about the PACKAGE — the name is a display string anyone can pick,
            while `com.calimero.…` is the thing that gets installed — so the
            mark belongs here as well as on the author below. */}
        <p className='mt-0.5 flex items-center gap-1 truncate font-mono text-[12.5px] text-neutral-500'>
          <span className='truncate'>{app.package_name}</span>
          {app.verified && <VerifiedMark label='Verified package' />}
        </p>

        {app.description && (
          <p
            className='mt-1 text-[14.5px] font-light leading-relaxed text-neutral-400'
            style={{
              display: '-webkit-box',
              WebkitLineClamp: large ? 2 : 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {app.description}
          </p>
        )}

        <div className='mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-neutral-500'>
          <span className='inline-flex min-w-0 items-center gap-1'>
            <span className='truncate text-neutral-400'>
              {app.developer?.display_name || app.developer_pubkey}
            </span>
            {/* ⚠️ The AUTHOR's badge reads the publisher's field. Both marks
                used to read `app.verified`, so a single value was making two
                different claims — and after the split it would have put a
                package's approval next to a person's name. */}
            {app.publisherVerified && <VerifiedMark label='Verified author' />}
          </span>
          {when && (
            <>
              <Dot />
              <span>{when}</span>
            </>
          )}
          {bytes && (
            <>
              <Dot />
              <span>{bytes}</span>
            </>
          )}
          <Dot />
          <span className='inline-flex items-center gap-1'>
            <Download className='h-3 w-3' aria-hidden='true' />
            {(app.downloads ?? 0).toLocaleString()}
          </span>
        </div>

        {category && (
          <span className='mt-3 inline-block border border-line-strong px-2 py-1 text-[11.5px] font-bold uppercase leading-none tracking-[0.15em] text-neutral-400'>
            {category}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * One mark, used everywhere a verified claim is made on a card.
 *
 * `aria-label` says WHICH claim — "Verified package" next to the id, "Verified
 * author" next to the publisher. Three identical unlabelled ticks in one card
 * is three unexplained icons to a screen reader.
 */
function VerifiedMark({ label }: { label: string }) {
  return (
    <BadgeCheck
      className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400'
      aria-label={label}
      role='img'
    />
  );
}

function Dot() {
  return (
    <span aria-hidden='true' className='text-neutral-700'>
      ·
    </span>
  );
}
