import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

/**
 * Registry-wide search, living in the rail.
 *
 * It navigates to `/explore?q=…` rather than holding the term in component
 * state. Two reasons: the old Apps-page search was lost the moment you clicked
 * an app and came back, and a URL is the only form of a search you can share
 * or reload into.
 *
 * It does NOT query the server per keystroke. `GET /api/v2/bundles` is cached
 * at the edge and nothing can purge it, so Explore fetches the list once and
 * filters it in memory; a request per keystroke would buy nothing and hammer
 * a cache that cannot answer differently.
 */
export function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');

  // Follow the URL when it changes underneath us — a back/forward, or a tag
  // chip that rewrites the query. Without this the box keeps a stale term
  // while the results below it have already moved on.
  useEffect(() => {
    setTerm(params.get('q') ?? '');
  }, [params]);

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (term === current) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term.trim()) next.set('q', term.trim());
      else next.delete('q');
      navigate({ pathname: '/explore', search: next.toString() });
      onNavigate?.();
    }, 200);
    return () => clearTimeout(id);
  }, [term, params, navigate, onNavigate]);

  return (
    <div className='relative'>
      <Search
        aria-hidden='true'
        className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500'
      />
      <input
        type='search'
        value={term}
        onChange={e => setTerm(e.target.value)}
        placeholder='Search apps'
        aria-label='Search apps'
        data-testid='global-search'
        className='w-full rounded-lg border border-ink/[0.08] bg-ink/[0.03] py-1.5 pl-8 pr-2.5 text-[12.5px] text-neutral-200 placeholder:text-neutral-600 focus:border-brand-600/40 focus:outline-none focus:ring-1 focus:ring-brand-600/30'
      />
    </div>
  );
}
