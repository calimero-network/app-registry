import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Package, X } from 'lucide-react';
import { getApps } from '@/lib/api';
import { AppCard } from '@/components/AppCard';
import { GlobalSearch } from '@/components/GlobalSearch';
import { formatCategory } from '@/lib/utils';
import { CATEGORIES, type AppSummary } from '@/types/api';
import { usePageMeta } from '@/lib/seo';

/**
 * ⚠️ THE CARD WIDTH MUST NOT DEPEND ON HOW MANY RESULTS THERE ARE.
 *
 * Two things used to move it: a grid that let a lone result stretch, and the
 * scrollbar disappearing when a filter stops the page scrolling
 * (`scrollbar-gutter: stable` in index.css now reserves it). The catalogue is
 * the full content column, two fixed tracks on a desktop: a lone result
 * takes one track, the same width it has in a full list.
 */
const COLUMN = 'w-full';
const TRACKS = 'min-[1100px]:grid-cols-2';

/**
 * Explore — every published app, searchable and filtered by category.
 *
 * Both the search term and the category live in the URL, not in component
 * state. A filtered view is then linkable, survives a reload, and comes back
 * intact when you press Back from an app page. The old Apps page kept its
 * search in `useState` and lost it on every navigation.
 *
 * Filtering happens in memory over one fetch. `GET /api/v2/bundles` is cached
 * at the edge and nothing can purge it, so a request per keystroke would add
 * latency without being able to return anything different.
 */
export default function ExplorePage() {
  usePageMeta({
    title: 'Explore apps',
    description:
      'Every application published to the Calimero registry: signed bundles, their publishers, versions and install sizes.',
  });

  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim().toLowerCase();
  const category = params.get('category') ?? '';
  /**
   * ⚠️ VERIFIED-ONLY IS THE DEFAULT, AND THE URL CARRIES THE OPT-OUT rather
   * than the opt-in. `?unverified=1` is the unusual state, so it is the one
   * that gets written down; a bare `/explore` always means the reviewed
   * listing, whoever shares the link.
   *
   * The flag this reads is the admin's decision about the package — plus the
   * trusted-publisher shortcut, which is what stops this hiding everything
   * Calimero has ever published.
   */
  const includeUnverified = params.get('unverified') === '1';

  const {
    data: apps = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ['apps'], queryFn: () => getApps() });

  // Only offer categories that actually have apps. A chip row of ten filters
  // where seven return nothing reads as a broken filter, not an empty shelf.
  const available = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of apps as AppSummary[]) {
      if (app.category)
        counts.set(app.category, (counts.get(app.category) ?? 0) + 1);
    }
    return CATEGORIES.filter(c => counts.has(c)).map(c => ({
      id: c,
      label: formatCategory(c) ?? c,
      count: counts.get(c) ?? 0,
    }));
  }, [apps]);

  const filtered = useMemo(() => {
    return (apps as AppSummary[]).filter(app => {
      if (!includeUnverified && !app.verified) return false;
      if (category && app.category !== category) return false;
      if (!query) return true;
      // Identity only: name, package, creator. Descriptions are deliberately
      // NOT searched — they run to a couple of hundred words, so a short query
      // like "a" or "app" matches nearly every bundle and the result count
      // stops meaning anything. Tags are excluded for the same reason the
      // category chips exist: that is what they are for.
      return [
        app.name,
        app.package_name,
        app.developer?.display_name,
        app.developer_pubkey,
      ]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(query));
    });
  }, [apps, query, category, includeUnverified]);

  const setCategory = (next: string) => {
    const p = new URLSearchParams(params);
    if (next && next !== category) p.set('category', next);
    else p.delete('category');
    setParams(p, { replace: true });
  };

  // Named so the count line can explain itself: a listing that silently drops
  // rows leaves the reader to wonder whether something is broken.
  const hiddenCount = (apps as AppSummary[]).filter(a => !a.verified).length;

  const clearAll = () => {
    const p = new URLSearchParams(params);
    p.delete('category');
    p.delete('q');
    setParams(p, { replace: true });
  };

  if (error) {
    return (
      <div className='py-16 text-center'>
        <p className='mb-4 text-[15px] text-neutral-400'>
          Failed to load applications
        </p>
        <button
          onClick={() => window.location.reload()}
          className='text-[15px] text-brand-600 transition-colors hover:text-brand-500'
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <header className='border-b border-line pb-6'>
        <p className='eyebrow mb-3'>The catalogue</p>
        <h1 className='text-xl font-semibold text-neutral-100'>Explore</h1>
        <p className='mt-3 text-[17px] font-light text-neutral-400'>
          Every application published to the registry.
        </p>
      </header>

      {/* Search, on the page, below `md` only.
          Above it the same box is in the rail, two inches away and always
          visible. Below it the rail is a drawer, so searching the registry
          from the page whose entire job is searching the registry took a
          menu press first — nothing on screen said search existed. */}
      <div className='min-[1100px]:hidden'>
        <GlobalSearch testId='explore-search' />
      </div>

      {available.length > 0 && (
        <div
          className='flex flex-wrap items-center gap-2'
          role='group'
          aria-label='Filter by category'
        >
          {available.map(c => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                aria-pressed={active}
                data-testid={`category-${c.id}`}
                className={`border px-3.5 py-2 text-[13px] font-bold uppercase tracking-[0.14em] transition-colors duration-150 ${
                  active
                    ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                    : 'border-line-strong text-neutral-400 hover:border-brand-600 hover:text-brand-600'
                }`}
              >
                {c.label}
                <span className='ml-1.5 text-neutral-600'>{c.count}</span>
              </button>
            );
          })}
          {/* The opt-out. Worded as what it shows rather than as a setting:
              "Include unverified" says what pressing it does, where a
              "Verified only" switch makes you work out which way is on. */}
          <button
            onClick={() => {
              const p = new URLSearchParams(params);
              if (includeUnverified) p.delete('unverified');
              else p.set('unverified', '1');
              setParams(p, { replace: true });
            }}
            aria-pressed={includeUnverified}
            data-testid='toggle-unverified'
            className={`border px-3.5 py-2 text-[13px] font-bold uppercase tracking-[0.14em] transition-colors duration-150 ${
              includeUnverified
                ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                : 'border-line-strong text-neutral-400 hover:border-brand-600 hover:text-brand-600'
            }`}
          >
            Include unverified
          </button>

          {(category || query) && (
            <button
              onClick={clearAll}
              data-testid='clear-filters'
              className='inline-flex items-center gap-1 px-2 py-2 text-[13px] font-bold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-neutral-300'
            >
              <X className='h-3 w-3' aria-hidden='true' />
              Clear
            </button>
          )}
        </div>
      )}

      <p className='text-[14px] text-neutral-500' data-testid='result-count'>
        {isLoading
          ? 'Loading…'
          : `${filtered.length} application${filtered.length === 1 ? '' : 's'}`}
        {!isLoading && (query || category) && ` of ${apps.length}`}
        {!isLoading && !includeUnverified && hiddenCount > 0 && (
          <>
            {' · '}
            <span className='text-neutral-600'>
              {hiddenCount} awaiting review
            </span>
          </>
        )}
      </p>

      {isLoading ? (
        <div className={`grid gap-3 ${TRACKS} ${COLUMN}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className='flex animate-pulse gap-4 border border-line p-4'
            >
              <div className='h-14 w-14 flex-shrink-0 rounded-xl bg-ink/[0.06]' />
              <div className='flex-1 space-y-2 pt-1'>
                <div className='h-3.5 w-1/3 rounded bg-ink/[0.06]' />
                <div className='h-3 w-full rounded bg-ink/[0.06]' />
                <div className='h-3 w-1/2 rounded bg-ink/[0.06]' />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className={`py-16 text-center ${COLUMN}`}
          data-testid='empty-state'
        >
          <Package
            className='mx-auto h-8 w-8 text-neutral-600'
            aria-hidden='true'
          />
          <p className='mt-3 text-[15px] text-neutral-400'>
            {query || category
              ? 'No apps match these filters.'
              : 'No applications published yet.'}
          </p>
          {(query || category) && (
            <button
              onClick={clearAll}
              className='mt-3 text-[15px] text-brand-600 transition-colors hover:text-brand-500'
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={`grid gap-3 ${TRACKS} ${COLUMN}`}>
          {filtered.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
