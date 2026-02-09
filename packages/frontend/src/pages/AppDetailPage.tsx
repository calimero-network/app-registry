import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  ArrowLeft,
  ExternalLink,
  User,
  FileCode,
  Hash,
  HardDrive,
  Clock,
  Github,
  BookOpen,
  Globe,
  Shield,
} from 'lucide-react';
import { api } from '@/lib/api';

interface V2Bundle {
  version: string;
  package: string;
  appVersion: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    icon?: string;
    tags?: string[];
    license?: string;
  };
  interfaces?: {
    exports?: string[];
    uses?: string[];
  };
  wasm?: { path: string; hash: string | null; size: number };
  abi?: { path: string; hash: string | null; size: number };
  links?: { frontend?: string; github?: string; docs?: string };
  signature?: {
    alg: string;
    sig: string;
    pubkey: string;
    signedAt?: string;
  };
  migrations?: unknown[];
}

export default function AppDetailPage() {
  const { appId = '' } = useParams<{ appId: string }>();

  const { data: allBundles = [], isLoading } = useQuery({
    queryKey: ['app-bundles', appId],
    queryFn: async () => {
      const response = await api.get('/v2/bundles', {
        params: { package: appId },
      });
      return (Array.isArray(response.data) ? response.data : []) as V2Bundle[];
    },
    enabled: !!appId,
  });

  const bundle = allBundles[0];

  if (isLoading) {
    return (
      <div className='space-y-5 animate-pulse'>
        <div className='h-4 bg-neutral-800 rounded w-20'></div>
        <div className='h-6 bg-neutral-800 rounded w-1/3'></div>
        <div className='h-3.5 bg-neutral-800 rounded w-1/2'></div>
        <div className='h-32 bg-neutral-800/50 rounded-lg'></div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className='space-y-6'>
        <BackLink />
        <div className='text-center py-16'>
          <Package className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            No published versions found for{' '}
            <span className='font-mono text-neutral-300'>{appId}</span>.
          </p>
        </div>
      </div>
    );
  }

  const meta = bundle.metadata;
  const links = bundle.links;
  const wasm = bundle.wasm;
  const abi = bundle.abi;
  const sig = bundle.signature;
  const ifaces = bundle.interfaces;

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Header */}
      <div>
        <div className='flex items-center gap-2.5 mb-1'>
          <h1 className='text-xl font-semibold text-neutral-100'>
            {meta?.name || appId}
          </h1>
          <span className='pill bg-brand-600/10 text-brand-600 font-mono'>
            v{bundle.appVersion}
          </span>
        </div>
        <p className='text-[12px] text-neutral-500 font-mono'>
          {bundle.package}
        </p>
        {meta?.description && (
          <p className='mt-3 text-[13px] text-neutral-400 font-light leading-relaxed max-w-2xl'>
            {meta.description}
          </p>
        )}
      </div>

      {/* Info grid */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        {meta?.author && (
          <InfoCard icon={User} label='Author' value={meta.author} />
        )}
        <InfoCard icon={Clock} label='Version' value={bundle.appVersion} />
        {meta?.license && (
          <InfoCard icon={Shield} label='License' value={meta.license} />
        )}
        <InfoCard
          icon={FileCode}
          label='Manifest'
          value={`v${bundle.version}`}
        />
      </div>

      {/* Links */}
      {links && (links.frontend || links.github || links.docs) && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Links</p>
          <div className='flex flex-wrap gap-2'>
            {links.frontend && (
              <LinkPill href={links.frontend} icon={Globe} label='Open App' />
            )}
            {links.github && (
              <LinkPill href={links.github} icon={Github} label='GitHub' />
            )}
            {links.docs && (
              <LinkPill href={links.docs} icon={BookOpen} label='Docs' />
            )}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {(wasm || abi) && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Artifacts</p>
          <div className='space-y-3'>
            {wasm && (
              <ArtifactRow
                label='WASM'
                path={wasm.path}
                size={wasm.size}
                hash={wasm.hash}
              />
            )}
            {abi && (
              <ArtifactRow
                label='ABI'
                path={abi.path}
                size={abi.size}
                hash={abi.hash}
              />
            )}
          </div>
        </div>
      )}

      {/* Interfaces */}
      {ifaces &&
        ((ifaces.exports?.length ?? 0) > 0 ||
          (ifaces.uses?.length ?? 0) > 0) && (
          <div className='card p-4'>
            <p className='section-heading mb-3'>Interfaces</p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {ifaces.exports && ifaces.exports.length > 0 && (
                <div>
                  <p className='text-[11px] text-neutral-500 mb-1.5'>Exports</p>
                  <div className='flex flex-wrap gap-1'>
                    {ifaces.exports.map(e => (
                      <span
                        key={e}
                        className='pill bg-brand-600/10 text-brand-600 font-mono'
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ifaces.uses && ifaces.uses.length > 0 && (
                <div>
                  <p className='text-[11px] text-neutral-500 mb-1.5'>Uses</p>
                  <div className='flex flex-wrap gap-1'>
                    {ifaces.uses.map(u => (
                      <span
                        key={u}
                        className='pill bg-neutral-800 text-neutral-300 font-mono'
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Tags */}
      {meta?.tags && meta.tags.length > 0 && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Tags</p>
          <div className='flex flex-wrap gap-1.5'>
            {meta.tags.map(tag => (
              <span
                key={tag}
                className='pill bg-neutral-800 text-neutral-300'
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signature */}
      {sig && sig.sig !== 'unsigned' && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Signature</p>
          <div className='space-y-2.5'>
            <SigRow icon={Hash} label='Algorithm' value={sig.alg} />
            <SigRow
              icon={HardDrive}
              label='Public Key'
              value={sig.pubkey}
              mono
              breakAll
            />
            {sig.signedAt && (
              <SigRow icon={Clock} label='Signed at' value={sig.signedAt} />
            )}
          </div>
        </div>
      )}

      {/* Version history */}
      {allBundles.length > 1 && (
        <div>
          <p className='section-heading mb-3'>Version History</p>
          <div className='space-y-1.5'>
            {allBundles.map(b => (
              <div
                key={b.appVersion}
                className='card px-4 py-2.5 flex items-center justify-between'
              >
                <div className='flex items-center gap-2'>
                  <Clock className='w-3 h-3 text-neutral-600' />
                  <span className='text-[13px] font-medium text-neutral-200'>
                    v{b.appVersion}
                  </span>
                </div>
                <span className='text-[11px] text-neutral-500 font-mono'>
                  {b.metadata?.author || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Helpers ---- */

function BackLink() {
  return (
    <Link
      to='/apps'
      className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
    >
      <ArrowLeft className='w-3 h-3' />
      Back to Apps
    </Link>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className='card px-3.5 py-2.5 flex items-center gap-2.5'>
      <Icon className='w-3.5 h-3.5 text-neutral-500 flex-shrink-0' />
      <div className='min-w-0'>
        <p className='text-[11px] text-neutral-500'>{label}</p>
        <p className='text-[13px] text-neutral-200 font-light truncate'>
          {value}
        </p>
      </div>
    </div>
  );
}

function ArtifactRow({
  label,
  path,
  size,
  hash,
}: {
  label: string;
  path: string;
  size: number;
  hash: string | null;
}) {
  return (
    <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 py-2 border-b border-neutral-800/60 last:border-0'>
      <span className='text-[11px] font-medium text-neutral-400 w-12 flex-shrink-0'>
        {label}
      </span>
      <span className='text-[12px] text-neutral-300 font-mono truncate'>
        {path}
      </span>
      <span className='text-[11px] text-neutral-500 flex-shrink-0'>
        {formatBytes(size)}
      </span>
      {hash && (
        <span className='text-[11px] text-neutral-600 font-mono truncate'>
          {hash}
        </span>
      )}
    </div>
  );
}

function SigRow({
  icon: Icon,
  label,
  value,
  mono,
  breakAll,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className='flex items-start gap-2'>
      <Icon className='w-3.5 h-3.5 text-neutral-600 mt-0.5 flex-shrink-0' />
      <div className='min-w-0'>
        <p className='text-[11px] text-neutral-500'>{label}</p>
        <p
          className={`text-[12px] text-neutral-300 ${mono ? 'font-mono' : ''} ${breakAll ? 'break-all' : ''}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function LinkPill({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-1.5 text-[12px] text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1.5 rounded-md transition-all'
    >
      <Icon className='w-3.5 h-3.5' />
      {label}
      <ExternalLink className='w-3 h-3 text-neutral-500' />
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
