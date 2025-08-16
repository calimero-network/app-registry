import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Package, ExternalLink } from 'lucide-react';
import { getApps } from '../lib/api';
import type { AppSummary } from '../types/api';

export default function AppsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [developerFilter, setDeveloperFilter] = useState('');

  const {
    data: apps = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['apps', { dev: developerFilter, name: searchTerm }],
    queryFn: () => getApps({ dev: developerFilter, name: searchTerm }),
  });

  const filteredApps = apps.filter(
    (app: AppSummary) =>
      app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.alias?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className='text-center py-12'>
        <div className='text-red-600 mb-4'>Failed to load apps</div>
        <button
          onClick={() => window.location.reload()}
          className='btn btn-primary'
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-3xl font-bold text-gray-900'>Apps</h1>
        <p className='mt-2 text-gray-600'>
          Discover and explore Smart Contract Applications in the registry
        </p>
      </div>

      {/* Search and Filters */}
      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4' />
          <input
            type='text'
            placeholder='Search apps by name or alias...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='input pl-10'
          />
        </div>
        <div className='relative'>
          <input
            type='text'
            placeholder='Filter by developer pubkey...'
            value={developerFilter}
            onChange={e => setDeveloperFilter(e.target.value)}
            className='input'
          />
        </div>
      </div>

      {/* Apps Grid */}
      {isLoading ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {[...Array(6)].map((_, i) => (
            <div key={i} className='card p-6 animate-pulse'>
              <div className='h-4 bg-gray-200 rounded w-3/4 mb-2'></div>
              <div className='h-3 bg-gray-200 rounded w-1/2 mb-4'></div>
              <div className='h-3 bg-gray-200 rounded w-1/4'></div>
            </div>
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <div className='text-center py-12'>
          <Package className='mx-auto h-12 w-12 text-gray-400' />
          <h3 className='mt-2 text-sm font-medium text-gray-900'>
            No apps found
          </h3>
          <p className='mt-1 text-sm text-gray-500'>
            {searchTerm || developerFilter
              ? 'Try adjusting your search criteria.'
              : 'Get started by registering your first app.'}
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {filteredApps.map((app: AppSummary) => (
            <AppCard key={`${app.developer_pubkey}/${app.name}`} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppCard({ app }: { app: AppSummary }) {
  return (
    <div className='card p-6 hover:shadow-md transition-shadow'>
      <div className='flex items-start justify-between mb-4'>
        <div>
          <h3 className='text-lg font-semibold text-gray-900'>{app.name}</h3>
          {app.alias && (
            <p className='text-sm text-gray-500'>Alias: {app.alias}</p>
          )}
        </div>
        <Package className='w-5 h-5 text-gray-400' />
      </div>
      <div className='space-y-2 mb-4'>
        <p className='text-sm text-gray-600'>
          <span className='font-medium'>Developer:</span>{' '}
          {app.developer ? (
            <Link
              to={`/developers/${app.developer.pubkey}`}
              className='text-primary-600 hover:text-primary-700 font-medium'
            >
              {app.developer.display_name}
            </Link>
          ) : (
            <span className='font-mono text-xs'>
              {app.developer_pubkey.substring(0, 12)}...
            </span>
          )}
        </p>
        <p className='text-sm text-gray-600'>
          <span className='font-medium'>Latest Version:</span>{' '}
          {app.latest_version}
        </p>
      </div>
      <Link
        to={`/apps/${app.developer_pubkey}/${app.name}`}
        className='inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700'
      >
        View Details
        <ExternalLink className='w-4 h-4 ml-1' />
      </Link>
    </div>
  );
}
