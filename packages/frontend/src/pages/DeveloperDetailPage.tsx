import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Package,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { developersApi, appsApi } from '../lib/api';
import type { DeveloperProfile, AppSummary } from '../types/api';

export function DeveloperDetailPage() {
  const { pubkey } = useParams<{ pubkey: string }>();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['developer', pubkey],
    queryFn: () => developersApi.getDeveloper(pubkey!),
    enabled: !!pubkey,
  });

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ['developer-apps', pubkey],
    queryFn: () => appsApi.getApps({ dev: pubkey }),
    enabled: !!pubkey,
  });

  if (!pubkey) {
    return <div>Invalid developer</div>;
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center gap-4'>
        <Link to='/developers' className='btn btn-secondary'>
          <ArrowLeft className='h-4 w-4 mr-2' />
          Back to Developers
        </Link>
      </div>

      {/* Developer Info */}
      <div className='card p-6'>
        <div className='flex items-start justify-between'>
          <div>
            <div className='flex items-center gap-3 mb-2'>
              <Shield className='h-8 w-8 text-primary-600' />
              <h1 className='text-3xl font-bold text-gray-900'>
                {profile?.display_name || 'Developer'}
              </h1>
            </div>
            <p className='text-sm text-gray-500 font-mono'>{pubkey}</p>
            {profile?.website && (
              <div className='flex items-center gap-2 mt-2'>
                <Globe className='h-4 w-4 text-gray-400' />
                <a
                  href={profile.website}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary-600 hover:underline'
                >
                  {profile.website}
                </a>
              </div>
            )}
          </div>
          <div className='text-right'>
            <div className='text-sm text-gray-500'>Total Apps</div>
            <div className='text-2xl font-bold text-primary-600'>
              {apps.length}
            </div>
          </div>
        </div>
      </div>

      {/* Proofs */}
      {profile?.proofs && profile.proofs.length > 0 && (
        <div className='card p-6'>
          <h2 className='text-xl font-semibold text-gray-900 mb-4'>
            Verification Proofs
          </h2>
          <div className='space-y-3'>
            {profile.proofs.map((proof, index) => (
              <div
                key={index}
                className='flex items-center justify-between p-3 border border-gray-200 rounded'
              >
                <div>
                  <div className='font-medium text-gray-900'>{proof.type}</div>
                  <div className='text-sm text-gray-500 font-mono'>
                    {proof.value}
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  {proof.verified ? (
                    <>
                      <CheckCircle className='h-5 w-5 text-green-500' />
                      <span className='text-sm text-green-600'>Verified</span>
                    </>
                  ) : (
                    <>
                      <XCircle className='h-5 w-5 text-red-500' />
                      <span className='text-sm text-red-600'>Unverified</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apps */}
      <div className='card p-6'>
        <h2 className='text-xl font-semibold text-gray-900 mb-4'>
          Applications
        </h2>
        {appsLoading ? (
          <div className='space-y-3'>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className='h-16 bg-gray-200 rounded animate-pulse'
              ></div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className='text-center py-8'>
            <Package className='mx-auto h-12 w-12 text-gray-400' />
            <h3 className='mt-2 text-sm font-medium text-gray-900'>
              No apps found
            </h3>
            <p className='mt-1 text-sm text-gray-500'>
              This developer hasn't published any apps yet.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {apps.map(app => (
              <AppRow key={`${app.developer_pubkey}/${app.name}`} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppRow({ app }: { app: AppSummary }) {
  return (
    <Link
      to={`/apps/${app.developer_pubkey}/${app.name}`}
      className='flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50 transition-colors'
    >
      <div className='flex items-center gap-3'>
        <Package className='h-5 w-5 text-gray-400' />
        <div>
          <div className='font-medium text-gray-900'>{app.name}</div>
          {app.alias && (
            <div className='text-sm text-gray-500'>{app.alias}</div>
          )}
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <span className='bg-green-100 text-green-800 px-2 py-1 rounded text-xs'>
          v{app.latest_version}
        </span>
      </div>
    </Link>
  );
}
