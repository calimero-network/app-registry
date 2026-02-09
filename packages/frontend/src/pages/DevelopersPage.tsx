import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, User, ArrowUpRight } from 'lucide-react';
import { getApps } from '@/lib/api';

export default function DevelopersPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  const developers = Array.from(
    new Set(
      apps.map(app => app.developer_pubkey).filter(a => a && a !== 'Unknown')
    )
  ).map(author => {
    const developerApps = apps.filter(app => app.developer_pubkey === author);
    return {
      pubkey: author,
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
      <div className='space-y-6'>
        <div className='animate-pulse space-y-4'>
          <div className='h-5 bg-neutral-800 rounded w-1/4'></div>
          <div className='h-3.5 bg-neutral-800 rounded w-1/3'></div>
          <div className='space-y-3 mt-6'>
            {[1, 2, 3].map(i => (
              <div key={i} className='h-16 bg-neutral-800/50 rounded-lg'></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-xl font-semibold text-neutral-100'>Developers</h1>
        <p className='mt-1 text-[13px] text-neutral-500 font-light'>
          Browse developers and their published applications
        </p>
      </div>

      {/* Search */}
      <div className='relative max-w-sm'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 h-3.5 w-3.5' />
        <input
          type='text'
          placeholder='Search developers or apps...'
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className='input pl-9'
        />
      </div>

      {/* List */}
      {filteredDevelopers.length === 0 ? (
        <div className='text-center py-16'>
          <User className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            {searchTerm
              ? 'No developers match your search.'
              : 'No developers have published applications yet.'}
          </p>
        </div>
      ) : (
        <div className='space-y-2'>
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
      className='card block px-4 py-3 group hover:border-brand-600/30'
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3 min-w-0'>
          <div className='flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 flex-shrink-0'>
            <User className='w-3.5 h-3.5 text-neutral-400' />
          </div>
          <div className='min-w-0'>
            <h3 className='text-[13px] font-medium text-neutral-200 truncate group-hover:text-white transition-colors'>
              {developer.pubkey}
            </h3>
            <p className='text-[11px] text-neutral-500 font-light'>
              Latest: {developer.latestApp}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-3 flex-shrink-0 ml-4'>
          <div className='flex items-center gap-1 text-[11px] text-neutral-500'>
            <Package className='w-3 h-3' />
            {developer.appCount}
          </div>
          <ArrowUpRight className='w-3.5 h-3.5 text-neutral-600 group-hover:text-brand-600 transition-all' />
        </div>
      </div>
    </Link>
  );
}
