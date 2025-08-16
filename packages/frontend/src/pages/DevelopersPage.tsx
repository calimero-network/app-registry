import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, User } from 'lucide-react';
import { getApps } from '@/lib/api';

export default function DevelopersPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  // Extract unique developers
  const developers = Array.from(
    new Set(apps.map(app => app.developer_pubkey))
  ).map(pubkey => {
    const developerApps = apps.filter(app => app.developer_pubkey === pubkey);
    return {
      pubkey,
      appCount: developerApps.length,
      latestApp: developerApps[0]?.name || 'Unknown',
    };
  });

  const filteredDevelopers = developers.filter(
    dev =>
      dev.pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dev.latestApp.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='animate-pulse'>
          <div className='h-8 bg-gray-200 rounded w-1/3 mb-4'></div>
          <div className='h-4 bg-gray-200 rounded w-1/2 mb-8'></div>
          <div className='space-y-4'>
            {[1, 2, 3].map(i => (
              <div key={i} className='h-20 bg-gray-200 rounded'></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-gray-900 mb-2'>Developers</h1>
        <p className='text-gray-600'>
          Browse developers and their published applications
        </p>
      </div>

      <div className='mb-6'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5' />
          <input
            type='text'
            placeholder='Search developers or apps...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'
          />
        </div>
      </div>

      {filteredDevelopers.length === 0 ? (
        <div className='text-center py-8'>
          <User className='mx-auto h-12 w-12 text-gray-400' />
          <h2 className='mt-4 text-lg font-medium text-gray-900'>
            No developers found
          </h2>
          <p className='mt-2 text-gray-500'>
            {searchTerm
              ? 'Try adjusting your search terms.'
              : 'No developers have published applications yet.'}
          </p>
        </div>
      ) : (
        <div className='grid gap-4'>
          {filteredDevelopers.map(developer => (
            <DeveloperCard key={developer.pubkey} developer={developer} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeveloperCard({
  developer,
}: {
  developer: { pubkey: string; appCount: number; latestApp: string };
}) {
  return (
    <Link
      to={`/developers/${developer.pubkey}`}
      className='block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow'
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center'>
          <User className='w-8 h-8 text-gray-400 mr-4' />
          <div>
            <h3 className='font-medium text-gray-900'>Developer</h3>
            <p className='text-sm text-gray-500 font-mono'>
              {developer.pubkey}
            </p>
            <p className='text-sm text-gray-600 mt-1'>
              Latest app: {developer.latestApp}
            </p>
          </div>
        </div>
        <div className='text-right'>
          <div className='flex items-center text-sm text-gray-600'>
            <Package className='w-4 h-4 mr-1' />
            {developer.appCount} app{developer.appCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </Link>
  );
}
