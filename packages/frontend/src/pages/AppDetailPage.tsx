import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Pencil,
  Trash2,
  Building2,
  ArrowRight,
  BadgeCheck,
} from 'lucide-react';
import {
  api,
  deleteBundleVersion,
  deletePackage,
  getOrgByPackage,
  getOrgMembers,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface V2Bundle {
  version: string;
  package: string;
  appVersion: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    _ownerEmail?: string;
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<
    string | null
  >(null);
  const [confirmDeletePackage, setConfirmDeletePackage] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const deleteVersionMutation = useMutation({
    mutationFn: (version: string) => deleteBundleVersion(appId, version),
    onSuccess: (_data, version) => {
      setConfirmDeleteVersion(null);
      setDeleteError(null);
      const remaining = allBundles.filter(b => b.appVersion !== version);
      if (remaining.length === 0) {
        navigate('/apps');
      } else {
        queryClient.invalidateQueries({ queryKey: ['app-bundles', appId] });
      }
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (err instanceof Error ? err.message : 'Delete failed');
      setDeleteError(msg);
      setConfirmDeleteVersion(null);
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: () => deletePackage(appId),
    onSuccess: () => {
      setConfirmDeletePackage(false);
      setDeleteError(null);
      navigate('/apps');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (err instanceof Error ? err.message : 'Delete failed');
      setDeleteError(msg);
      setConfirmDeletePackage(false);
    },
  });

  const { data: linkedOrg = null } = useQuery({
    queryKey: ['org-by-package', appId],
    queryFn: () => getOrgByPackage(appId),
    enabled: !!appId,
  });

  const { data: orgMembersData = null } = useQuery({
    queryKey: ['org-members-edit', linkedOrg?.id],
    queryFn: () => getOrgMembers(linkedOrg!.id),
    enabled: !!linkedOrg?.id && !!user?.email,
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
  const ownerEmail = meta?._ownerEmail ?? meta?.author ?? '';
  const isOwner = !!user?.email && !!ownerEmail && user.email === ownerEmail;
  const authorVerified =
    ownerEmail.includes('@') &&
    ownerEmail.toLowerCase().endsWith('@calimero.network');
  const userEmailLower = user?.email?.toLowerCase() ?? '';
  const isOrgMember =
    !!userEmailLower &&
    !!orgMembersData?.members?.some(
      m => m.email.toLowerCase() === userEmailLower
    );
  const canEdit = isOwner || isOrgMember;

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Header */}
      <div>
        <div className='flex flex-wrap items-center gap-2.5 mb-1'>
          <h1 className='text-xl font-semibold text-neutral-100'>
            {meta?.name || appId}
          </h1>
          <span className='pill bg-brand-600/10 text-brand-600 font-mono'>
            v{bundle.appVersion}
          </span>
          {canEdit && (
            <Link
              to={`/apps/${appId}/${bundle.appVersion}/edit`}
              className='inline-flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 transition-colors'
            >
              <Pencil className='w-3.5 h-3.5' />
              Edit metadata
            </Link>
          )}
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

      {/* Delete error */}
      {deleteError && (
        <p className='text-[12px] text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2'>
          {deleteError}
        </p>
      )}

      {/* Info grid */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        {meta?.author && (
          <InfoCard
            icon={User}
            label='Author'
            value={meta.author}
            verified={authorVerified}
          />
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

      {/* Organization */}
      {linkedOrg && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Organization</p>
          <Link
            to={`/orgs/${encodeURIComponent(linkedOrg.id)}`}
            className='flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
          >
            <div className='flex items-center gap-3'>
              <div className='flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800'>
                <Building2 className='w-4 h-4 text-neutral-400' />
              </div>
              <div>
                <span className='text-[13px] font-medium text-neutral-200'>
                  {linkedOrg.name}
                </span>
                {linkedOrg.slug && (
                  <span className='text-neutral-500 text-[12px] ml-2 font-mono'>
                    {linkedOrg.slug}
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className='w-4 h-4 text-neutral-500' />
          </Link>
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
              <span key={tag} className='pill bg-neutral-800 text-neutral-300'>
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
      {allBundles.length > 0 && (
        <div>
          <p className='section-heading mb-3'>
            {allBundles.length > 1 ? 'Version History' : 'Version'}
          </p>
          <div className='space-y-1.5'>
            {allBundles.map(b => {
              const vOwnerEmail =
                b.metadata?._ownerEmail ?? b.metadata?.author ?? '';
              const isVersionOwner =
                !!user?.email && !!vOwnerEmail && user.email === vOwnerEmail;
              const vAuthorVerified =
                vOwnerEmail.includes('@') &&
                vOwnerEmail.toLowerCase().endsWith('@calimero.network');
              const canEditVersion = isVersionOwner || isOrgMember;
              const isConfirmingThisVersion =
                confirmDeleteVersion === b.appVersion;
              return (
                <div
                  key={b.appVersion}
                  className='card px-4 py-2.5 flex items-center justify-between gap-3'
                >
                  <div className='flex items-center gap-2'>
                    <Clock className='w-3 h-3 text-neutral-600' />
                    <span className='text-[13px] font-medium text-neutral-200'>
                      v{b.appVersion}
                    </span>
                  </div>
                  <div className='flex items-center gap-3'>
                    <span className='inline-flex items-center gap-1 text-[11px] text-neutral-500 font-mono'>
                      {b.metadata?.author || ''}
                      {vAuthorVerified && (
                        <BadgeCheck className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400' />
                      )}
                    </span>
                    {canEditVersion && (
                      <Link
                        to={`/apps/${appId}/${b.appVersion}/edit`}
                        className='inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors'
                      >
                        <Pencil className='w-3 h-3' />
                        Edit
                      </Link>
                    )}
                    {isVersionOwner && (
                      <>
                        {isConfirmingThisVersion ? (
                          <span className='flex items-center gap-1.5 text-[11px]'>
                            <span className='text-red-400'>Delete?</span>
                            <button
                              onClick={() =>
                                deleteVersionMutation.mutate(b.appVersion)
                              }
                              disabled={deleteVersionMutation.isPending}
                              className='text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50'
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteVersion(null)}
                              className='text-neutral-500 hover:text-neutral-300 transition-colors'
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmDeleteVersion(b.appVersion)
                            }
                            className='inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-red-400 transition-colors'
                          >
                            <Trash2 className='w-3 h-3' />
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete entire package — owner only */}
      {isOwner && (
        <div className='card p-4 border-red-900/30'>
          <p className='section-heading mb-3 text-red-400/80'>Danger Zone</p>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <p className='text-[13px] text-neutral-300'>Delete package</p>
              <p className='text-[12px] text-neutral-500'>
                Permanently removes all {allBundles.length} version
                {allBundles.length !== 1 ? 's' : ''} of{' '}
                <span className='font-mono'>{appId}</span>. This cannot be
                undone.
              </p>
            </div>
            {confirmDeletePackage ? (
              <span className='flex items-center gap-2 text-[12px] flex-shrink-0'>
                <span className='text-red-400'>Are you sure?</span>
                <button
                  onClick={() => deletePackageMutation.mutate()}
                  disabled={deletePackageMutation.isPending}
                  className='text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50'
                >
                  Yes, delete all
                </button>
                <button
                  onClick={() => setConfirmDeletePackage(false)}
                  className='text-neutral-500 hover:text-neutral-300 transition-colors'
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDeletePackage(true)}
                className='inline-flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-400 border border-red-900/50 hover:border-red-700/60 px-3 py-1.5 rounded-lg transition-all flex-shrink-0'
              >
                <Trash2 className='w-3.5 h-3.5' />
                Delete package
              </button>
            )}
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
  verified,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <div className='card px-3.5 py-2.5 flex items-center gap-2.5'>
      <Icon className='w-3.5 h-3.5 text-neutral-500 flex-shrink-0' />
      <div className='min-w-0'>
        <p className='text-[11px] text-neutral-500'>{label}</p>
        <p className='text-[13px] text-neutral-200 font-light truncate flex items-center gap-1'>
          {value}
          {verified && (
            <BadgeCheck className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400' />
          )}
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
