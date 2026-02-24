import { useState } from 'react';
import { getOrgsByMember } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ArrowRight, Search } from 'lucide-react';

export default function MyOrgsPage() {
  const [pubkey, setPubkey] = useState('');

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs-by-member', pubkey.trim()],
    queryFn: () => getOrgsByMember(pubkey.trim()),
    enabled: pubkey.trim().length > 0,
  });

  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-semibold text-neutral-100 mb-2'>
          Organizations
        </h1>
        <p className='text-neutral-400 text-sm'>
          Enter a member public key to list organizations they belong to.
        </p>
      </div>

      {/* Pubkey input */}
      <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-6'>
        <div className='flex items-center gap-2 mb-3'>
          <Search className='w-4 h-4 text-brand-600' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Look up organizations by member
          </h2>
        </div>
        <input
          type='text'
          value={pubkey}
          onChange={e => setPubkey(e.target.value)}
          placeholder='e.g. 5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9c...'
          className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600'
        />
      </div>

      {/* Org list */}
      <div>
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          Organizations
        </h2>
        {!pubkey.trim() ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              Enter a member public key above to see their organizations.
            </p>
          </div>
        ) : isLoading ? (
          <div className='space-y-3 animate-pulse'>
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
          </div>
        ) : orgs.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              No organizations found for this member.
            </p>
          </div>
        ) : (
          <ul className='space-y-2'>
            {orgs.map(org => (
              <li key={org.id}>
                <Link
                  to={`/orgs/${encodeURIComponent(org.id)}`}
                  className='flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800'>
                      <Building2 className='w-4 h-4 text-neutral-400' />
                    </div>
                    <div>
                      <span className='text-neutral-200 font-medium'>
                        {org.name}
                      </span>
                      {org.slug && (
                        <span className='text-neutral-500 text-sm ml-2 font-mono'>
                          {org.slug}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className='w-4 h-4 text-neutral-500' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
