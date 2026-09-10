import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api, getApps } from '@/lib/api';
import { AppCard } from '@/components/AppCard';
import { formatCategory } from '@/lib/utils';
import { CATEGORIES, type AppSummary } from '@/types/api';

/**
 * The storefront front page.
 *
 * This replaced a centred marketing hero ("Discover & Deploy / Verifiable
 * Apps") that filled the first screen with a claim and put the actual apps
 * below the fold. A store's front page is the shelves: the pitch is one line,
 * and everything under it is something you can click.
 *
 * Sections are derived, never curated. "Recently updated" sorts by the
 * registry's own `publishedAt`, so it cannot go stale or point at a yanked
 * package the way a hand-picked list would.
 */
export default function HomePage() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await api.get('/stats')).data,
  });

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  // Bundles published before the metadata policy have no `publishedAt`. They
  // sort last rather than being dropped — an app with no timestamp is still an
  // app, and excluding them would silently hide a third of the registry.
  const recent = [...(apps as AppSummary[])]
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
      return tb - ta;
    })
    .slice(0, 6);

  const popular = [...(apps as AppSummary[])]
    .filter(a => (a.downloads ?? 0) > 0)
    .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
    .slice(0, 4);

  const categoriesInUse = CATEGORIES.filter(c =>
    (apps as AppSummary[]).some(a => a.category === c)
  );

  return (
    <div className='space-y-12'>
      <section>
        <h1 className='text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl'>
          Applications for Calimero
        </h1>
        <p className='mt-2 max-w-xl text-[13.5px] font-light leading-relaxed text-neutral-400'>
          Cryptographically signed, immutably versioned, decentrally stored.
        </p>
        <div className='mt-5 flex flex-wrap items-center gap-3'>
          <Link
            to='/explore'
            className='inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-medium text-black transition-colors duration-150 hover:bg-brand-500'
          >
            Browse apps
            <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
          </Link>
          {stats && (
            <span className='text-[12.5px] text-neutral-500'>
              {stats.publishedApps ?? 0} apps · {stats.activeDevelopers ?? 0}{' '}
              developers
            </span>
          )}
        </div>
      </section>

      {categoriesInUse.length > 0 && (
        <section>
          <SectionHeading title='Browse by category' />
          <div className='mt-3 flex flex-wrap gap-1.5'>
            {categoriesInUse.map(c => (
              <Link
                key={c}
                to={`/explore?category=${c}`}
                className='rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-neutral-300 transition-colors duration-150 hover:border-white/[0.16] hover:text-neutral-100'
              >
                {formatCategory(c)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading title='Recently updated' href='/explore' />
        {isLoading ? (
          <SkeletonGrid />
        ) : (
          <div className='mt-3 grid gap-3 lg:grid-cols-2'>
            {recent.map(app => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>

      {popular.length > 0 && (
        <section>
          <SectionHeading title='Most downloaded' href='/explore' />
          <div className='mt-3 grid gap-3 lg:grid-cols-2'>
            {popular.map(app => (
              <AppCard key={app.id} app={app} size='compact' />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className='flex items-baseline justify-between'>
      <h2 className='text-[15px] font-medium text-neutral-200'>{title}</h2>
      {href && (
        <Link
          to={href}
          className='text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-300'
        >
          See all
        </Link>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className='mt-3 grid gap-3 lg:grid-cols-2'>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className='flex animate-pulse gap-4 rounded-xl border border-white/[0.06] p-4'
        >
          <div className='h-14 w-14 flex-shrink-0 rounded-xl bg-white/[0.06]' />
          <div className='flex-1 space-y-2 pt-1'>
            <div className='h-3.5 w-1/3 rounded bg-white/[0.06]' />
            <div className='h-3 w-full rounded bg-white/[0.06]' />
          </div>
        </div>
      ))}
    </div>
  );
}
