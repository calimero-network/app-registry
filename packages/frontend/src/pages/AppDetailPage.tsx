import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Download, Globe, Clock } from 'lucide-react';
import { getAppVersions, getAppManifest } from '@/lib/api';

export default function AppDetailPage() {
  const { pubkey = '', appName = '' } = useParams<{
    pubkey: string;
    appName: string;
  }>();

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['app-versions', pubkey, appName],
    queryFn: () => getAppVersions(pubkey, appName),
    enabled: !!pubkey && !!appName,
  });

  const latestVersion = versions[0];
  const { data: manifest } = useQuery({
    queryKey: ['app-manifest', pubkey, appName, latestVersion?.semver],
    queryFn: () => getAppManifest(pubkey, appName, latestVersion.semver),
    enabled: !!latestVersion?.semver,
  });

  if (versionsLoading) {
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

  if (!versions.length) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='text-center'>
          <Package className='mx-auto h-12 w-12 text-gray-400' />
          <h2 className='mt-4 text-lg font-medium text-gray-900'>
            No versions found
          </h2>
          <p className='mt-2 text-gray-500'>
            This app has no published versions yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-gray-900 mb-2'>{appName}</h1>
        <p className='text-gray-600'>Developer: {pubkey}</p>
        {manifest && (
          <p className='text-gray-600'>
            Latest version: {manifest.version.semver}
          </p>
        )}
      </div>

      {manifest && (
        <div className='bg-white rounded-lg border border-gray-200 p-6 mb-8'>
          <h2 className='text-xl font-semibold mb-4'>App Details</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <h3 className='font-medium text-gray-900 mb-2'>
                Supported Chains
              </h3>
              <div className='flex flex-wrap gap-2'>
                {manifest.supported_chains.map(chain => (
                  <span
                    key={chain}
                    className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800'
                  >
                    <Globe className='w-3 h-3 mr-1' />
                    {chain}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className='font-medium text-gray-900 mb-2'>Permissions</h3>
              <div className='space-y-2'>
                {manifest.permissions.map((perm, index) => (
                  <div key={index} className='flex justify-between text-sm'>
                    <span className='text-gray-600'>{perm.cap}</span>
                    <span className='text-gray-900'>{perm.bytes} bytes</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className='mt-6'>
            <h3 className='font-medium text-gray-900 mb-2'>Artifacts</h3>
            <div className='space-y-3'>
              {manifest.artifacts.map((artifact, index) => (
                <div
                  key={index}
                  className='flex items-center justify-between p-3 bg-gray-50 rounded-lg'
                >
                  <div className='flex items-center'>
                    <Download className='w-4 h-4 text-gray-400 mr-2' />
                    <div>
                      <p className='font-medium text-sm'>{artifact.type}</p>
                      <p className='text-xs text-gray-500'>{artifact.target}</p>
                    </div>
                  </div>
                  <div className='text-right'>
                    <p className='text-sm font-medium'>{artifact.cid}</p>
                    <p className='text-xs text-gray-500'>
                      {artifact.size} bytes
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className='text-xl font-semibold mb-4'>Version History</h2>
        <div className='space-y-3'>
          {versions.map(version => (
            <VersionRow key={version.semver} version={version} />
          ))}
        </div>
      </div>
    </div>
  );
}

function VersionRow({
  version,
}: {
  version: { semver: string; cid: string; yanked?: boolean };
}) {
  return (
    <div className='flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg'>
      <div className='flex items-center'>
        <Clock className='w-4 h-4 text-gray-400 mr-2' />
        <div>
          <p className='font-medium'>{version.semver}</p>
          <p className='text-sm text-gray-500'>{version.cid}</p>
        </div>
      </div>
      {version.yanked && (
        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800'>
          Yanked
        </span>
      )}
    </div>
  );
}
