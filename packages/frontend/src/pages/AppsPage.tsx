import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Package, ArrowUpRight } from 'lucide-react';
import { getApps } from '../lib/api';
import type { AppSummary } from '../types/api';

export default function AppsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: apps = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  const filteredApps = useMemo(() => {
    if (!searchTerm.trim()) return apps;
    const q = searchTerm.toLowerCase();
    return apps.filter(
      (app: AppSummary) =>
        app.name.toLowerCase().includes(q) ||
        app.package_name.toLowerCase().includes(q) ||
        app.developer_pubkey.toLowerCase().includes(q) ||
        app.alias?.toLowerCase().includes(q)
    );
  }, [apps, searchTerm]);

  if (error) {
    return (
      <div className='text-center py-16'>
        <p className='text-[13px] text-neutral-400 mb-4'>
          Failed to load applications
        </p>
        <button
          onClick={() => window.location.reload()}
          className='text-[13px] text-brand-600 hover:text-brand-500 transition-colors'
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <div className='flex items-baseline gap-3'>
          <h1 className='text-xl font-semibold text-neutral-100'>Apps</h1>
          {!isLoading && (
            <span className='text-[12px] text-neutral-500 font-light'>
              {filteredApps.length}
              {searchTerm ? ` of ${apps.length}` : ''} application
              {filteredApps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className='mt-1 text-[13px] text-neutral-500 font-light'>
          Discover and explore applications in the registry
        </p>
      </div>

      {/* Search */}
      <div className='relative max-w-sm'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 h-3.5 w-3.5' />
        <input
          type='text'
          placeholder='Search by name, package, or developer...'
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className='input pl-9'
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {[...Array(6)].map((_, i) => (
            <div key={i} className='card p-4 animate-pulse'>
              <div className='h-3.5 bg-neutral-800 rounded w-2/3 mb-3'></div>
              <div className='h-3 bg-neutral-800 rounded w-full mb-2'></div>
              <div className='h-3 bg-neutral-800 rounded w-1/3'></div>
            </div>
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <div className='text-center py-16'>
          <Package className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            {searchTerm
              ? 'No apps match your search.'
              : 'No applications published yet.'}
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {filteredApps.map((app: AppSummary) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppCard({ app }: { app: AppSummary }) {
  return (
    <Link
      to={`/apps/${app.id}`}
      className='card p-4 group hover:border-brand-600/30 block'
    >
      <div className='flex items-start justify-between mb-2'>
        <h3 className='text-[13px] font-medium text-neutral-200 truncate pr-2 group-hover:text-white transition-colors'>
          {app.name}
        </h3>
        <ArrowUpRight className='w-3.5 h-3.5 text-neutral-600 group-hover:text-brand-600 transition-all flex-shrink-0 mt-0.5' />
      </div>
      <p className='text-[11px] text-neutral-500 font-mono truncate mb-3'>
        {app.package_name}
      </p>
      <div className='flex items-center justify-between'>
        <span className='text-[11px] text-neutral-400 font-light'>
          {app.developer?.display_name || app.developer_pubkey}
        </span>
        <span className='text-[11px] text-neutral-600 font-mono'>
          v{app.latest_version}
        </span>
      </div>
    </Link>
  );
}
