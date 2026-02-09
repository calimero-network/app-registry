import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, User, ArrowLeft, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';

interface V2Bundle {
  version: string;
  package: string;
  appVersion: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
    license?: string;
  };
  wasm?: { path: string; hash: string | null; size: number };
  links?: { frontend?: string; github?: string; docs?: string };
  signature?: { alg: string; sig: string; pubkey: string; signedAt?: string };
}

export default function DeveloperDetailPage() {
  const { pubkey = '' } = useParams<{ pubkey: string }>();
  const decodedName = decodeURIComponent(pubkey);

  const { data: allBundles = [], isLoading } = useQuery({
    queryKey: ['bundles-all'],
    queryFn: async () => {
      const response = await api.get('/v2/bundles');
      return (Array.isArray(response.data) ? response.data : []) as V2Bundle[];
    },
  });

  const developerBundles = allBundles.filter(
    b => b.metadata?.author === decodedName
  );

  const uniqueApps = new Map<string, V2Bundle>();
  for (const b of developerBundles) {
    if (!uniqueApps.has(b.package)) {
      uniqueApps.set(b.package, b);
    }
  }
  const apps = Array.from(uniqueApps.values());

  if (isLoading) {
    return (
      <div className='space-y-5 animate-pulse'>
        <div className='h-4 bg-neutral-800 rounded w-24'></div>
        <div className='h-6 bg-neutral-800 rounded w-1/3'></div>
        <div className='h-3.5 bg-neutral-800 rounded w-1/4'></div>
        <div className='h-24 bg-neutral-800/50 rounded-lg'></div>
      </div>
    );
  }

  if (developerBundles.length === 0) {
    return (
      <div className='space-y-6'>
        <BackLink />
        <div className='text-center py-16'>
          <User className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            No published bundles found for &quot;{decodedName}&quot;.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Header */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800'>
          <User className='w-4 h-4 text-neutral-400' />
        </div>
        <div>
          <h1 className='text-xl font-semibold text-neutral-100'>
            {decodedName}
          </h1>
          <p className='text-[12px] text-neutral-500 font-light'>
            {apps.length} app{apps.length !== 1 ? 's' : ''} &middot;{' '}
            {developerBundles.length} bundle
            {developerBundles.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Published apps */}
      <div>
        <p className='section-heading mb-3'>Published Applications</p>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          {apps.map(bundle => (
            <Link
              key={bundle.package}
              to={`/apps/${bundle.package}`}
              className='card p-4 group hover:border-brand-600/30'
            >
              <div className='flex items-start justify-between mb-1.5'>
                <h3 className='text-[13px] font-medium text-neutral-200 truncate pr-2 group-hover:text-white transition-colors'>
                  {bundle.metadata?.name || bundle.package}
                </h3>
                <ArrowUpRight className='w-3.5 h-3.5 text-neutral-600 group-hover:text-brand-600 transition-all flex-shrink-0 mt-0.5' />
              </div>
              <p className='text-[11px] text-neutral-500 font-mono truncate'>
                {bundle.package}
              </p>
              {bundle.metadata?.description && (
                <p className='text-[11px] text-neutral-500 font-light mt-1.5 line-clamp-2'>
                  {bundle.metadata.description}
                </p>
              )}
              <p className='text-[11px] text-neutral-600 font-mono mt-2'>
                v{bundle.appVersion}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* All bundles */}
      <div>
        <p className='section-heading mb-3'>All Bundles</p>
        <div className='space-y-1.5'>
          {developerBundles.map(b => (
            <Link
              key={`${b.package}-${b.appVersion}`}
              to={`/apps/${b.package}`}
              className='card px-4 py-2.5 flex items-center justify-between group hover:border-brand-600/30'
            >
              <div className='flex items-center gap-2 min-w-0'>
                <Package className='w-3 h-3 text-neutral-600 flex-shrink-0' />
                <span className='text-[13px] text-neutral-300 truncate'>
                  {b.metadata?.name || b.package}
                </span>
                <span className='pill bg-brand-600/10 text-brand-600 font-mono flex-shrink-0'>
                  v{b.appVersion}
                </span>
              </div>
              {b.wasm && (
                <span className='text-[11px] text-neutral-600 flex-shrink-0 ml-2'>
                  {formatBytes(b.wasm.size)}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to='/developers'
      className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
    >
      <ArrowLeft className='w-3 h-3' />
      Back to Developers
    </Link>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
