import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Download, Shield, Calendar } from 'lucide-react';
import { appsApi } from '../lib/api';
import type { VersionInfo, AppManifest } from '../types/api';

export function AppDetailPage() {
  const { pubkey, appName } = useParams<{ pubkey: string; appName: string }>();

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['app-versions', pubkey, appName],
    queryFn: () => appsApi.getAppVersions(pubkey!, appName!),
    enabled: !!pubkey && !!appName,
  });

  const latestVersion = versions.find(v => !v.yanked) || versions[0];

  const { data: manifest, isLoading: manifestLoading } = useQuery({
    queryKey: ['app-manifest', pubkey, appName, latestVersion?.semver],
    queryFn: () =>
      appsApi.getAppManifest(pubkey!, appName!, latestVersion!.semver),
    enabled: !!latestVersion,
  });

  if (!pubkey || !appName) {
    return <div>Invalid app</div>;
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center gap-4'>
        <Link to='/apps' className='btn btn-secondary'>
          <ArrowLeft className='h-4 w-4 mr-2' />
          Back to Apps
        </Link>
      </div>

      {/* App Info */}
      <div className='card p-6'>
        <div className='flex items-start justify-between'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900'>{appName}</h1>
            <p className='text-sm text-gray-500 font-mono mt-1'>{pubkey}</p>
            {manifest?.app.alias && (
              <p className='text-gray-600 mt-2'>{manifest.app.alias}</p>
            )}
          </div>
          <div className='text-right'>
            <div className='text-sm text-gray-500'>Latest Version</div>
            <div className='text-2xl font-bold text-primary-600'>
              {latestVersion ? `v${latestVersion.semver}` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Manifest Details */}
      {manifest && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          <div className='card p-6'>
            <h2 className='text-xl font-semibold text-gray-900 mb-4'>
              App Details
            </h2>
            <div className='space-y-3'>
              <div>
                <label className='text-sm font-medium text-gray-500'>
                  App ID
                </label>
                <p className='text-sm text-gray-900 font-mono'>
                  {manifest.app.id}
                </p>
              </div>
              <div>
                <label className='text-sm font-medium text-gray-500'>
                  Supported Chains
                </label>
                <div className='flex flex-wrap gap-1 mt-1'>
                  {manifest.supported_chains.map(chain => (
                    <span
                      key={chain}
                      className='bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs'
                    >
                      {chain}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className='text-sm font-medium text-gray-500'>
                  Permissions
                </label>
                <div className='space-y-1 mt-1'>
                  {manifest.permissions.map((perm, index) => (
                    <div key={index} className='text-sm text-gray-900'>
                      {perm.cap}: {perm.bytes} bytes
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className='card p-6'>
            <h2 className='text-xl font-semibold text-gray-900 mb-4'>
              Artifacts
            </h2>
            <div className='space-y-3'>
              {manifest.artifacts.map((artifact, index) => (
                <div key={index} className='border border-gray-200 rounded p-3'>
                  <div className='flex items-center justify-between mb-2'>
                    <span className='font-medium text-gray-900'>
                      {artifact.type}
                    </span>
                    <span className='text-sm text-gray-500'>
                      {artifact.target}
                    </span>
                  </div>
                  <div className='text-sm text-gray-600 space-y-1'>
                    <div className='flex justify-between'>
                      <span>CID:</span>
                      <span className='font-mono text-xs'>{artifact.cid}</span>
                    </div>
                    <div className='flex justify-between'>
                      <span>Size:</span>
                      <span>{artifact.size} bytes</span>
                    </div>
                  </div>
                  {artifact.mirrors && artifact.mirrors.length > 0 && (
                    <div className='mt-2'>
                      <div className='text-xs text-gray-500 mb-1'>Mirrors:</div>
                      {artifact.mirrors.map((mirror, mirrorIndex) => (
                        <div
                          key={mirrorIndex}
                          className='text-xs text-blue-600 hover:underline'
                        >
                          <a
                            href={mirror}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            {mirror}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Version History */}
      <div className='card p-6'>
        <h2 className='text-xl font-semibold text-gray-900 mb-4'>
          Version History
        </h2>
        {versionsLoading ? (
          <div className='space-y-3'>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className='h-12 bg-gray-200 rounded animate-pulse'
              ></div>
            ))}
          </div>
        ) : versions.length === 0 ? (
          <p className='text-gray-500'>No versions found</p>
        ) : (
          <div className='space-y-3'>
            {versions.map(version => (
              <VersionRow
                key={version.semver}
                version={version}
                pubkey={pubkey}
                appName={appName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VersionRow({
  version,
  pubkey,
  appName,
}: {
  version: VersionInfo;
  pubkey: string;
  appName: string;
}) {
  return (
    <div className='flex items-center justify-between p-3 border border-gray-200 rounded'>
      <div className='flex items-center gap-3'>
        <Package className='h-5 w-5 text-gray-400' />
        <div>
          <div className='font-medium text-gray-900'>v{version.semver}</div>
          <div className='text-sm text-gray-500 font-mono'>{version.cid}</div>
        </div>
      </div>
      <div className='flex items-center gap-2'>
        {version.yanked && (
          <span className='bg-red-100 text-red-800 px-2 py-1 rounded text-xs'>
            Yanked
          </span>
        )}
        <Link
          to={`/apps/${pubkey}/${appName}/${version.semver}`}
          className='btn btn-primary text-sm'
        >
          <Download className='h-4 w-4 mr-1' />
          Download
        </Link>
      </div>
    </div>
  );
}
