import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Package, X } from 'lucide-react';
import { getApps } from '@/lib/api';
import { AppCard } from '@/components/AppCard';
import { formatCategory } from '@/lib/utils';
import { CATEGORIES, type AppSummary } from '@/types/api';

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
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim().toLowerCase();
  const category = params.get('category') ?? '';

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
  }, [apps, query, category]);

  const setCategory = (next: string) => {
    const p = new URLSearchParams(params);
    if (next && next !== category) p.set('category', next);
    else p.delete('category');
    setParams(p, { replace: true });
  };

  const clearAll = () => {
    const p = new URLSearchParams(params);
    p.delete('category');
    p.delete('q');
    setParams(p, { replace: true });
  };

  if (error) {
    return (
      <div className='py-16 text-center'>
        <p className='mb-4 text-[13px] text-neutral-400'>
          Failed to load applications
        </p>
        <button
          onClick={() => window.location.reload()}
          className='text-[13px] text-brand-600 transition-colors hover:text-brand-500'
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <header>
        <h1 className='text-xl font-semibold text-neutral-100'>Explore</h1>
        <p className='mt-1 text-[13px] font-light text-neutral-500'>
          Every application published to the registry.
        </p>
      </header>

      {available.length > 0 && (
        <div
          className='flex flex-wrap items-center gap-1.5'
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
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150 ${
                  active
                    ? 'border-brand-600/40 bg-brand-600/15 text-brand-500'
                    : 'border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:border-white/[0.16] hover:text-neutral-200'
                }`}
              >
                {c.label}
                <span className='ml-1.5 text-neutral-600'>{c.count}</span>
              </button>
            );
          })}
          {(category || query) && (
            <button
              onClick={clearAll}
              data-testid='clear-filters'
              className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-neutral-500 transition-colors hover:text-neutral-300'
            >
              <X className='h-3 w-3' aria-hidden='true' />
              Clear
            </button>
          )}
        </div>
      )}

      <p className='text-[12px] text-neutral-500' data-testid='result-count'>
        {isLoading
          ? 'Loading…'
          : `${filtered.length} application${filtered.length === 1 ? '' : 's'}`}
        {!isLoading && (query || category) && ` of ${apps.length}`}
      </p>

      {isLoading ? (
        <div className='grid gap-3'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className='flex animate-pulse gap-4 rounded-xl border border-white/[0.06] p-4'
            >
              <div className='h-14 w-14 flex-shrink-0 rounded-xl bg-white/[0.06]' />
              <div className='flex-1 space-y-2 pt-1'>
                <div className='h-3.5 w-1/3 rounded bg-white/[0.06]' />
                <div className='h-3 w-full rounded bg-white/[0.06]' />
                <div className='h-3 w-1/2 rounded bg-white/[0.06]' />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className='py-16 text-center' data-testid='empty-state'>
          <Package
            className='mx-auto h-8 w-8 text-neutral-600'
            aria-hidden='true'
          />
          <p className='mt-3 text-[13px] text-neutral-400'>
            {query || category
              ? 'No apps match these filters.'
              : 'No applications published yet.'}
          </p>
          {(query || category) && (
            <button
              onClick={clearAll}
              className='mt-3 text-[13px] text-brand-600 transition-colors hover:text-brand-500'
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className='grid gap-3'>
          {filtered.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
