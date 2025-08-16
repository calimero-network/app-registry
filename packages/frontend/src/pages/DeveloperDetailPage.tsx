import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Globe, ExternalLink } from 'lucide-react';
import { getDeveloper, getApps } from '@/lib/api';

export default function DeveloperDetailPage() {
  const { pubkey = '' } = useParams<{ pubkey: string }>();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['developer', pubkey],
    queryFn: () => getDeveloper(pubkey),
    enabled: !!pubkey,
  });

  const { data: allApps = [] } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  const developerApps = allApps.filter(app => app.developer_pubkey === pubkey);

  if (profileLoading) {
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

  if (!profile) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='text-center'>
          <Package className='mx-auto h-12 w-12 text-gray-400' />
          <h2 className='mt-4 text-lg font-medium text-gray-900'>
            Developer not found
          </h2>
          <p className='mt-2 text-gray-500'>
            The requested developer profile could not be found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-gray-900 mb-2'>
          {profile.display_name}
        </h1>
        <p className='text-gray-600 font-mono text-sm'>{pubkey}</p>
        {profile.website && (
          <a
            href={profile.website}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center text-blue-600 hover:text-blue-800 mt-2'
          >
            <Globe className='w-4 h-4 mr-1' />
            {profile.website}
            <ExternalLink className='w-3 h-3 ml-1' />
          </a>
        )}
      </div>

      {profile.proofs.length > 0 && (
        <div className='bg-white rounded-lg border border-gray-200 p-6 mb-8'>
          <h2 className='text-xl font-semibold mb-4'>Verification Proofs</h2>
          <div className='space-y-3'>
            {profile.proofs.map((proof, index) => (
              <div
                key={index}
                className='flex items-center justify-between p-3 bg-gray-50 rounded-lg'
              >
                <div>
                  <p className='font-medium text-sm'>{proof.type}</p>
                  <p className='text-xs text-gray-500 font-mono'>
                    {proof.value}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    proof.verified
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {proof.verified ? 'Verified' : 'Unverified'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className='text-xl font-semibold mb-4'>Published Applications</h2>
        {developerApps.length === 0 ? (
          <div className='text-center py-8'>
            <Package className='mx-auto h-12 w-12 text-gray-400' />
            <h3 className='mt-4 text-lg font-medium text-gray-900'>
              No applications
            </h3>
            <p className='mt-2 text-gray-500'>
              This developer hasn't published any applications yet.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {developerApps.map(app => (
              <AppRow key={`${app.developer_pubkey}-${app.name}`} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppRow({
  app,
}: {
  app: {
    name: string;
    developer_pubkey: string;
    latest_version: string;
    alias?: string;
  };
}) {
  return (
    <div className='flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg'>
      <div className='flex items-center'>
        <Package className='w-4 h-4 text-gray-400 mr-3' />
        <div>
          <p className='font-medium'>{app.name}</p>
          {app.alias && <p className='text-sm text-gray-500'>{app.alias}</p>}
        </div>
      </div>
      <div className='text-right'>
        <p className='text-sm text-gray-600'>Latest: v{app.latest_version}</p>
      </div>
    </div>
  );
}
