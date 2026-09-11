import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  ArrowLeft,
  User,
  FileCode,
  Hash,
  HardDrive,
  Clock,
  BookOpen,
  Shield,
  Pencil,
  Trash2,
  Building2,
  ArrowRight,
  BadgeCheck,
  Ban,
  RotateCcw,
} from 'lucide-react';
import {
  api,
  deleteBundleVersion,
  deletePackage,
  yankBundleVersion,
  getOrgByPackage,
  getOrgMembers,
} from '@/lib/api';
import { GithubIcon } from '@/components/BrandIcons';
import { useAuth } from '@/contexts/AuthContext';
import { AppIcon } from '@/components/AppIcon';
import { AppPreview } from '@/components/AppPreview';
import { OpenAppTile } from '@/components/OpenAppTile';
import { CATEGORIES } from '@/types/api';
import { formatBytes, formatCategory, formatRelativeDate } from '@/lib/utils';

interface V2Bundle {
  version: string;
  package: string;
  appVersion: string;
  verified?: boolean;
  yanked?: boolean;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    icon?: string;
    tags?: string[];
    license?: string;
    category?: string;
  };
  /** Measured by the registry at upload; null for bundles that predate it. */
  installSize?: number | null;
  /** Stamped by the registry at upload; null for bundles that predate it. */
  publishedAt?: string | null;
  downloads?: number;
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
  const [confirmYankVersion, setConfirmYankVersion] = useState<string | null>(
    null
  );
  const [confirmUnYankVersion, setConfirmUnYankVersion] = useState<
    string | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [yankError, setYankError] = useState<string | null>(null);
  const [yankingVersion, setYankingVersion] = useState<string | null>(null);

  const { data: allBundles = [], isLoading } = useQuery({
    queryKey: ['app-bundles', appId],
    queryFn: async () => {
      const response = await api.get('/v2/bundles', {
        params: { package: appId, all_versions: 'true' },
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

  const yankVersionMutation = useMutation({
    mutationFn: ({ version, yanked }: { version: string; yanked: boolean }) =>
      yankBundleVersion(appId, version, yanked),
    onSuccess: () => {
      setYankingVersion(null);
      setYankError(null);
      queryClient.invalidateQueries({ queryKey: ['app-bundles', appId] });
    },
    onError: (err: unknown) => {
      setYankingVersion(null);
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (err instanceof Error ? err.message : 'Yank failed');
      setYankError(msg);
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
        <div className='h-4 bg-ink/[0.06] rounded w-20'></div>
        <div className='h-6 bg-ink/[0.06] rounded w-1/3'></div>
        <div className='h-3.5 bg-ink/[0.06] rounded w-1/2'></div>
        <div className='h-32 bg-ink/[0.04] rounded-lg'></div>
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

  // Same resolution the listing uses: `metadata.category` when the bundle
  // carries one, else a `tags` entry naming a category. Reading the explicit
  // field alone finds nothing on any bundle published before cargo-mero
  // learned the field.
  const resolvedCategory = (() => {
    const declared = meta?.category?.trim().toLowerCase();
    if (declared && (CATEGORIES as readonly string[]).includes(declared)) {
      return declared;
    }
    return (meta?.tags ?? [])
      .map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .map(t => (t === 'game' ? 'games' : t))
      .find(t => (CATEGORIES as readonly string[]).includes(t));
  })();
  const wasm = bundle.wasm;
  const abi = bundle.abi;
  const sig = bundle.signature;
  const ifaces = bundle.interfaces;
  const authorVerified = !!bundle.verified;
  // Ownership: author is now stored as username; fallback for legacy bundles where author was email
  const bundleAuthor = meta?.author ?? '';
  const isOwner =
    !!user &&
    !!bundleAuthor &&
    (bundleAuthor === user.username ||
      (bundleAuthor.includes('@') &&
        !user.username &&
        bundleAuthor === user.email));
  const userEmailLower = user?.email?.toLowerCase() ?? '';
  const orgRole = userEmailLower
    ? (orgMembersData?.members?.find(
        m => m.email.toLowerCase() === userEmailLower
      )?.role ?? null)
    : null;
  const isOrgManager = orgRole === 'owner' || orgRole === 'admin';

  /**
   * ⚠️ ONE RULE, AND IT IS THE SERVER'S.
   *
   * `canManagePackage` in shared/package-permissions.js is: the package's
   * author, an admin or owner of the organization it belongs to, or a site
   * admin. Every route that edits a package — the metadata PATCH, the asset
   * upload, delete, yank — asks exactly that.
   *
   * This page used to compute `isOwner || isOrgMember` for editing, which was
   * wrong in BOTH directions: it offered the controls to a plain org member,
   * who gets a 403 the moment they use them, and it hid them from a site
   * admin, who is allowed. An affordance that does not match the rule behind
   * it is worse than no affordance — it either lies or withholds.
   */
  const canManagePackage = isOwner || isOrgManager || !!user?.isAdmin;
  const canEdit = canManagePackage;

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Hero — store shape: icon, name, creator, then the facts that decide
          whether to install. Size and date come from the registry itself, so
          they are trustworthy in a way a self-declared value would not be. */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
        <AppIcon
          icon={meta?.icon}
          name={meta?.name || appId || '?'}
          seed={bundle.package}
          size={88}
        />
        <div className='min-w-0 flex-1'>
          <div className='mb-1 flex flex-wrap items-center gap-2.5'>
            <h1 className='text-2xl font-semibold tracking-tight text-neutral-100'>
              {meta?.name || appId}
            </h1>
            <span className='pill bg-brand-600/10 font-mono text-brand-600'>
              v{bundle.appVersion}
            </span>
            {canEdit && (
              <Link
                to={`/apps/${appId}/${bundle.appVersion}/edit`}
                className='inline-flex items-center gap-1.5 text-[12px] text-neutral-400 transition-colors hover:text-neutral-200'
              >
                <Pencil className='h-3.5 w-3.5' />
                Edit metadata
              </Link>
            )}
          </div>
          {/* The badge belongs on the package id as well as on the author in
              the grid below: the display name is a string anyone can choose,
              while this is the identifier that gets installed. */}
          <p className='flex items-center gap-1.5 font-mono text-[12px] text-neutral-500'>
            {bundle.package}
            {authorVerified && (
              <BadgeCheck
                className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400'
                aria-label='Verified package'
                role='img'
              />
            )}
          </p>

          <div className='mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-neutral-500'>
            {meta?.author && (
              <span className='text-neutral-400'>{meta.author}</span>
            )}
            {formatCategory(resolvedCategory) && (
              <span className='rounded-md border border-line bg-ink/[0.03] px-1.5 py-0.5 text-[11px] text-neutral-400'>
                {formatCategory(resolvedCategory)}
              </span>
            )}
            {formatBytes(bundle.installSize) && (
              <span>{formatBytes(bundle.installSize)}</span>
            )}
            {formatRelativeDate(bundle.publishedAt) && (
              <span>Updated {formatRelativeDate(bundle.publishedAt)}</span>
            )}
            <span>{(bundle.downloads ?? 0).toLocaleString()} downloads</span>
          </div>

          {meta?.description && (
            <p className='mt-3 max-w-2xl text-[13px] font-light leading-relaxed text-neutral-400'>
              {meta.description}
            </p>
          )}
        </div>
      </div>

      <AppPreview pkg={bundle.package} canEdit={canEdit} />

      {/* Delete error */}
      {deleteError && (
        <p className='text-[12px] text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2'>
          {deleteError}
        </p>
      )}
      {yankError && (
        <p className='text-[12px] text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2'>
          {yankError}
        </p>
      )}

      {/* Info grid.
          ⚠️ ONE COLUMN ON A PHONE. Two 168px cards at 360px left about 120px
          for the value, and `calimero-network` — the author, which is the
          whole point of the card — was cut through a glyph. These are short
          facts; stacking them costs a little height and keeps every one of
          them readable. */}
      <div
        data-testid='info-grid'
        className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4'
      >
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
        {/* Guarded: a bundle published before the manifest carried a version
            has none, and the unguarded template rendered the string
            "vundefined" on the page. */}
        {bundle.version && (
          <InfoCard
            icon={FileCode}
            label='Manifest'
            value={`v${bundle.version}`}
          />
        )}
        {/* Source and docs sit with the other facts about the package rather
            than in a links block of their own — they are attributes of the
            app, the same as its version or licence. The live preview is the
            one link that is not a fact, so it gets its own section. */}
        {links?.github && (
          <LinkCard icon={GithubIcon} label='Source code' href={links.github} />
        )}
        {links?.docs && (
          <LinkCard icon={BookOpen} label='Documentation' href={links.docs} />
        )}
      </div>

      {/* The deployed frontend, live. Its own section because it is the app
          itself rather than a fact about it; GitHub and docs are up in the
          info grid with version and licence.

          Headed "Try it out on web" rather than "Preview": the strip above is
          the preview (screenshots), and this is the running app — two sections
          both called Preview said nothing about the difference. */}
      {links?.frontend && (
        <section aria-label='Try it out on web'>
          <p className='section-heading mb-3'>Try it out on web</p>
          <OpenAppTile
            url={links.frontend}
            name={meta?.name || bundle.package}
          />
        </section>
      )}

      {/* Organization.
          On `name`, not on the object: the lookup answers with a body either
          way, and an org without one rendered as a heading over an empty row
          with an arrow at the end of it. */}
      {linkedOrg?.name && (
        <div className='card p-4'>
          <p className='section-heading mb-3'>Organization</p>
          <Link
            to={`/orgs/${encodeURIComponent(linkedOrg.id)}`}
            className='card flex items-center justify-between px-4 py-3 hover:border-brand-600/30'
          >
            <div className='flex items-center gap-3'>
              <div className='flex items-center justify-center w-8 h-8 rounded-full bg-ink/[0.06] border border-line'>
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
                        className='pill bg-ink/[0.06] text-neutral-300 font-mono'
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
              <span key={tag} className='pill bg-ink/[0.06] text-neutral-300'>
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
              const vAuthorVerified = !!b.verified;
              const vAuthor = b.metadata?.author ?? '';
              const isVersionOwner =
                !!user &&
                !!vAuthor &&
                (vAuthor === user.username ||
                  (vAuthor.includes('@') &&
                    !user.username &&
                    vAuthor === user.email));
              // Same rule as above, per version: the server asks
              // `canManagePackage` for the metadata PATCH too, so editing and
              // managing a version are the same permission.
              const canManageVersion =
                isVersionOwner || isOrgManager || !!user?.isAdmin;
              const canEditVersion = canManageVersion;
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
                    {b.yanked && (
                      <span className='pill bg-amber-500/10 text-amber-400 text-[10px]'>
                        Yanked
                      </span>
                    )}
                    {canManageVersion &&
                      (b.yanked ? (
                        confirmUnYankVersion === b.appVersion ? (
                          <span className='flex items-center gap-1.5 text-[11px]'>
                            <span className='text-amber-400'>Unyank?</span>
                            <button
                              onClick={() => {
                                setConfirmUnYankVersion(null);
                                setYankingVersion(b.appVersion);
                                yankVersionMutation.mutate({
                                  version: b.appVersion,
                                  yanked: false,
                                });
                              }}
                              disabled={yankingVersion === b.appVersion}
                              className='text-amber-400 hover:text-amber-300 font-medium transition-colors disabled:opacity-50'
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmUnYankVersion(null)}
                              className='text-neutral-500 hover:text-neutral-300 transition-colors'
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmUnYankVersion(b.appVersion)
                            }
                            disabled={yankingVersion === b.appVersion}
                            className='inline-flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-300 transition-colors disabled:opacity-50'
                          >
                            <RotateCcw className='w-3 h-3' />
                            Unyank
                          </button>
                        )
                      ) : confirmYankVersion === b.appVersion ? (
                        <span className='flex items-center gap-1.5 text-[11px]'>
                          <span className='text-amber-400'>Yank?</span>
                          <button
                            onClick={() => {
                              setConfirmYankVersion(null);
                              setYankingVersion(b.appVersion);
                              yankVersionMutation.mutate({
                                version: b.appVersion,
                                yanked: true,
                              });
                            }}
                            disabled={yankingVersion === b.appVersion}
                            className='text-amber-400 hover:text-amber-300 font-medium transition-colors disabled:opacity-50'
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmYankVersion(null)}
                            className='text-neutral-500 hover:text-neutral-300 transition-colors'
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmYankVersion(b.appVersion)}
                          disabled={yankingVersion === b.appVersion}
                          className='inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-amber-400 transition-colors disabled:opacity-50'
                        >
                          <Ban className='w-3 h-3' />
                          Yank
                        </button>
                      ))}
                    {canManageVersion && (
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

      {/* Delete entire package — author, org admin/owner, or site admin */}
      {canManagePackage && (
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

/**
 * A link presented as a fact, in the same grid as author and version.
 *
 * The URL itself is not shown: a raw github.com/... string is noise next to
 * "v0.0.7", it truncates in a narrow card, and it tells you nothing the icon
 * does not. Label on top, icon underneath, whole card clickable.
 */
function LinkCard({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noreferrer noopener'
      aria-label={label}
      className='card flex flex-col justify-center gap-1 px-3.5 py-2.5 transition-colors hover:border-line-strong'
    >
      <p className='text-[11px] text-neutral-500'>{label}</p>
      <Icon className='h-4 w-4 text-brand-600' />
    </a>
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
        {/* ⚠️ `truncate` GOES ON THE TEXT, NOT ON THE ROW. The row is a flex
            container, and `text-overflow` does nothing on one — the value was
            clipped mid-glyph with no ellipsis, so it read as a rendering
            fault rather than as truncation. */}
        <p className='flex items-center gap-1 text-[13px] font-light text-neutral-200'>
          <span className='truncate'>{value}</span>
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
    <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 py-2 border-b border-line last:border-0'>
      <span className='text-[11px] font-medium text-neutral-400 w-12 flex-shrink-0'>
        {label}
      </span>
      <span className='text-[12px] text-neutral-300 font-mono truncate'>
        {path}
      </span>
      <span className='text-[11px] text-neutral-500 flex-shrink-0'>
        {formatBytes(size) ?? '—'}
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
