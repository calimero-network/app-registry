import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, User, ArrowLeft, BadgeCheck } from 'lucide-react';
import { api, toAppSummary } from '@/lib/api';
import { AppCard } from '@/components/AppCard';

interface V2Bundle {
  version: string;
  package: string;
  appVersion: string;
  verified?: boolean;
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

  // Derive verified from _ownerEmail in any of the developer's bundles
  const verified = developerBundles.some(b => b.verified);
  const displayName = decodedName;

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
        <div className='h-4 bg-ink/[0.06] rounded w-24'></div>
        <div className='h-6 bg-ink/[0.06] rounded w-1/3'></div>
        <div className='h-3.5 bg-ink/[0.06] rounded w-1/4'></div>
        <div className='h-24 bg-ink/[0.04] rounded-lg'></div>
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
      <div className='flex items-center gap-3 animate-fade-in'>
        <div className='flex items-center justify-center w-10 h-10 rounded-full bg-surface border border-line'>
          <User className='w-4 h-4 text-neutral-400' />
        </div>
        <div>
          <h1 className='flex items-center gap-2 text-xl font-semibold text-neutral-100'>
            <span className='font-mono'>{displayName}</span>
            {verified && (
              <BadgeCheck className='h-5 w-5 text-emerald-400 flex-shrink-0' />
            )}
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
        {/* The same card Home and Explore use. This page had its own markup,
            which is why it showed no icon, no downloads and no size, and why
            it was the only surface still carrying the lime `glow-border`
            hover. Reusing the component means it cannot drift again. */}
        <div className='grid gap-3'>
          {apps.map(bundle => (
            <AppCard key={bundle.package} app={toAppSummary(bundle)} />
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
              className='group flex items-center justify-between rounded-xl border border-line bg-ink/[0.02] px-4 py-2.5 transition-colors duration-150 hover:border-line-strong hover:bg-ink/[0.04]'
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
