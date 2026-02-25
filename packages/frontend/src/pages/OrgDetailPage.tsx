import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  getOrg,
  getOrgMembers,
  getOrgPackages,
  addOrgMember,
  removeOrgMember,
  linkOrgPackage,
  unlinkOrgPackage,
  updateOrg,
  getMyOrgPubkeyBase64url,
  api,
} from '@/lib/api';
import { getStoredKeypair } from '@/lib/org-keypair';
import {
  sanitizeText,
  validateOrgPackageName,
  ORG_PACKAGE_NAME_MAX,
} from '@/lib/utils';
import {
  Building2,
  ArrowLeft,
  Users,
  Package,
  ArrowUpRight,
  Shield,
  UserPlus,
  Trash2,
  Link2,
  Unlink,
  Settings,
  Save,
  X,
  AlertTriangle,
} from 'lucide-react';

/** Extract a readable message from an Axios or generic error. */
function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.error === 'string') return data.error;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

/** Validate that a string looks like a base64url (43 chars) or base58 (~44 chars) Ed25519 pubkey. */
function isValidPubkeyFormat(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (/^[A-Za-z0-9\-_]{43}$/.test(s)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(s)) return true;
  return false;
}

export default function OrgDetailPage() {
  const { orgId = '' } = useParams<{ orgId: string }>();
  const decodedOrgId = decodeURIComponent(orgId);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [hasKeypair, setHasKeypair] = useState(false);

  // Add member form
  const [newMemberPubkey, setNewMemberPubkey] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>(
    'member'
  );
  const [memberPubkeyTouched, setMemberPubkeyTouched] = useState(false);

  // Link package form
  const [newPackageName, setNewPackageName] = useState('');
  const [packageNameTouched, setPackageNameTouched] = useState(false);
  const [packageNameError, setPackageNameError] = useState<string | null>(null);
  const [checkingPackage, setCheckingPackage] = useState(false);

  // Metadata edit
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState('');

  // Confirmation dialogs for destructive actions
  const [confirmRemovePubkey, setConfirmRemovePubkey] = useState<string | null>(
    null
  );
  const [confirmUnlinkPkg, setConfirmUnlinkPkg] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    getMyOrgPubkeyBase64url().then(setMyPubkey);
    getStoredKeypair().then(kp => setHasKeypair(!!kp));
  }, []);

  const {
    data: org,
    isLoading: orgLoading,
    error: orgError,
  } = useQuery({
    queryKey: ['org', decodedOrgId],
    queryFn: () => getOrg(decodedOrgId),
    enabled: !!decodedOrgId,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', decodedOrgId],
    queryFn: () => getOrgMembers(decodedOrgId),
    enabled: !!decodedOrgId && !!org,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['org-packages', decodedOrgId],
    queryFn: () => getOrgPackages(decodedOrgId),
    enabled: !!decodedOrgId && !!org,
  });

  const members = membersData?.members ?? [];
  const packages = packagesData?.packages ?? [];
  const isAdmin =
    !!myPubkey &&
    members.some(m => m.pubkey === myPubkey && m.role === 'admin');
  /** Admin identity is confirmed but only a public key is stored — can't sign writes. */
  const isAdminReadOnly = isAdmin && !hasKeypair;
  /** Admin with a full signing keypair — full write access. */
  const isAdminWithKeypair = isAdmin && hasKeypair;

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrgMember(
        decodedOrgId,
        sanitizeText(newMemberPubkey.trim()),
        newMemberRole
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['org-members', decodedOrgId],
      });
      setNewMemberPubkey('');
      setNewMemberRole('member');
      setMemberPubkeyTouched(false);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberPubkey: string) =>
      removeOrgMember(decodedOrgId, memberPubkey),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['org-members', decodedOrgId],
      });
      setConfirmRemovePubkey(null);
    },
  });

  const linkPackageMutation = useMutation({
    mutationFn: (name: string) => linkOrgPackage(decodedOrgId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['org-packages', decodedOrgId],
      });
      setNewPackageName('');
      setPackageNameTouched(false);
      setPackageNameError(null);
    },
  });

  const unlinkPackageMutation = useMutation({
    mutationFn: (packageName: string) =>
      unlinkOrgPackage(decodedOrgId, packageName),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['org-packages', decodedOrgId],
      });
      setConfirmUnlinkPkg(null);
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: (metadata: Record<string, unknown>) =>
      updateOrg(decodedOrgId, { metadata }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', decodedOrgId] });
      setIsEditingMetadata(false);
      setMetadataError('');
    },
  });

  const handleOpenMetadataEdit = () => {
    setMetadataJson(JSON.stringify(org?.metadata ?? {}, null, 2));
    setMetadataError('');
    setIsEditingMetadata(true);
  };

  const handleSaveMetadata = () => {
    setMetadataError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(metadataJson);
      if (
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        parsed === null
      ) {
        setMetadataError('Must be a JSON object, e.g. {"key": "value"}');
        return;
      }
    } catch {
      setMetadataError('Invalid JSON');
      return;
    }
    updateOrgMutation.mutate(parsed);
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberPubkeyTouched(true);
    if (!newMemberPubkey.trim() || !isValidPubkeyFormat(newMemberPubkey))
      return;
    addMemberMutation.mutate();
  };

  const handleLinkPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setPackageNameTouched(true);
    const nameErr = validateOrgPackageName(newPackageName);
    if (nameErr) {
      setPackageNameError(nameErr);
      return;
    }

    // Check the package exists before linking
    setCheckingPackage(true);
    setPackageNameError(null);
    linkPackageMutation.reset();
    try {
      const res = await api.get('/v2/bundles', {
        params: { package: sanitizeText(newPackageName.trim()) },
      });
      const bundles = Array.isArray(res.data) ? res.data : [];
      if (bundles.length === 0) {
        setPackageNameError(
          `Package "${newPackageName.trim()}" was not found in the registry.`
        );
        return;
      }
    } catch {
      setPackageNameError('Could not verify package — please try again.');
      return;
    } finally {
      setCheckingPackage(false);
    }

    linkPackageMutation.mutate(sanitizeText(newPackageName.trim()));
  };

  const memberPubkeyErr =
    memberPubkeyTouched && newMemberPubkey.trim()
      ? isValidPubkeyFormat(newMemberPubkey)
        ? null
        : 'Must be a base64url (43 chars) or base58 (43–44 chars) Ed25519 public key.'
      : null;

  const pkgNameErr = packageNameTouched
    ? (packageNameError ?? validateOrgPackageName(newPackageName))
    : packageNameError;

  const isLoading = orgLoading;
  const notFound = !orgLoading && (orgError || !org);

  if (isLoading) {
    return (
      <div className='space-y-5 animate-pulse'>
        <div className='h-4 bg-neutral-800 rounded w-24' />
        <div className='h-6 bg-neutral-800 rounded w-1/3' />
        <div className='h-3.5 bg-neutral-800 rounded w-1/4' />
        <div className='h-24 bg-neutral-800/50 rounded-xl' />
        <div className='h-32 bg-neutral-800/50 rounded-xl' />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className='space-y-6'>
        <BackLink />
        <div className='text-center py-16'>
          <Building2 className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            Organization not found.
          </p>
          <Link
            to='/orgs'
            className='mt-4 inline-block text-brand-600 text-sm hover:underline'
          >
            Back to Organizations
          </Link>
        </div>
      </div>
    );
  }

  const hasMetadata =
    org!.metadata != null && Object.keys(org!.metadata).length > 0;

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Header */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800'>
          <Building2 className='w-4 h-4 text-neutral-400' />
        </div>
        <div>
          <h1 className='text-xl font-semibold text-neutral-100'>
            {org!.name}
          </h1>
          <p className='text-[12px] text-neutral-500 font-mono'>
            {org!.slug || org!.id}
          </p>
        </div>
      </div>

      {/* Members */}
      <section>
        <p className='section-heading mb-3'>
          <Users className='w-3.5 h-3.5 inline mr-1.5' />
          Members
        </p>

        {isAdminReadOnly && (
          <ReadOnlyAdminNotice />
        )}

        {isAdminWithKeypair && (
          <form
            className='mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3'
            onSubmit={handleAddMember}
          >
            <p className='text-[12px] font-medium text-neutral-300'>
              Add member
            </p>
            <div className='flex flex-wrap items-start gap-3'>
              <div className='flex-1 min-w-[220px]'>
                <label className='block text-[11px] text-neutral-500 mb-1'>
                  Pubkey (base64url or base58)
                </label>
                <input
                  type='text'
                  value={newMemberPubkey}
                  onChange={e => {
                    setNewMemberPubkey(e.target.value);
                    if (memberPubkeyTouched && e.target.value.trim())
                      setMemberPubkeyTouched(true);
                  }}
                  onBlur={() => setMemberPubkeyTouched(true)}
                  placeholder='Paste member pubkey…'
                  className={`input w-full ${
                    memberPubkeyErr
                      ? 'border-red-500/70 focus-visible:ring-red-500/30 focus-visible:border-red-500'
                      : ''
                  }`}
                />
                {memberPubkeyErr && (
                  <p className='mt-1 text-[11px] text-red-400'>
                    {memberPubkeyErr}
                  </p>
                )}
              </div>
              <div className='w-36'>
                <label className='block text-[11px] text-neutral-500 mb-1'>
                  Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={e =>
                    setNewMemberRole(e.target.value as 'admin' | 'member')
                  }
                  className='w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-[13px] text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-600/50 focus-visible:border-brand-600/50 transition-all duration-200 cursor-pointer'
                >
                  <option value='member'>Member</option>
                  <option value='admin'>Admin</option>
                </select>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='submit'
                disabled={addMemberMutation.isPending}
                className='inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2 text-[13px] font-medium transition-colors'
              >
                <UserPlus className='w-3.5 h-3.5' />
                {addMemberMutation.isPending ? 'Adding…' : 'Add member'}
              </button>
            </div>
            {addMemberMutation.isError && (
              <p className='text-[12px] text-red-400'>
                {getApiErrorMessage(addMemberMutation.error)}
              </p>
            )}
          </form>
        )}

        {membersLoading ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 animate-pulse'>
            <div className='h-10 bg-neutral-800/50 rounded mb-2' />
            <div className='h-10 bg-neutral-800/50 rounded' />
          </div>
        ) : members.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
            No members listed.
          </div>
        ) : (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden'>
            <table className='w-full text-[13px]'>
              <thead>
                <tr className='border-b border-neutral-800 bg-neutral-800/30'>
                  <th className='text-left py-3 px-5 font-medium text-neutral-300'>
                    Pubkey
                  </th>
                  <th className='text-left py-3 px-5 font-medium text-neutral-300 w-28'>
                    Role
                  </th>
                  {isAdmin && (
                    <th className='text-right py-3 px-5 font-medium text-neutral-300 w-32'>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const isConfirming = confirmRemovePubkey === m.pubkey;
                  const isRemoving =
                    removeMemberMutation.isPending &&
                    removeMemberMutation.variables === m.pubkey;
                  return (
                    <tr
                      key={m.pubkey}
                      className='border-b border-neutral-800/80 last:border-0'
                    >
                      <td className='py-3 px-5 font-mono text-neutral-400 truncate max-w-[280px]'>
                        {m.pubkey}
                        {m.pubkey === myPubkey && (
                          <span className='ml-2 text-[10px] text-brand-600 font-sans'>
                            (you)
                          </span>
                        )}
                      </td>
                      <td className='py-3 px-5'>
                        {m.role === 'admin' ? (
                          <span className='inline-flex items-center gap-1 pill bg-amber-500/10 text-amber-500'>
                            <Shield className='w-3 h-3' />
                            Admin
                          </span>
                        ) : (
                          <span className='pill bg-neutral-700/50 text-neutral-400'>
                            Member
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className='py-3 px-5 text-right'>
                          {isConfirming ? (
                            <span className='inline-flex items-center gap-2'>
                              <span className='text-[11px] text-neutral-400'>
                                Remove?
                              </span>
                              <button
                                type='button'
                                onClick={() =>
                                  removeMemberMutation.mutate(m.pubkey)
                                }
                                disabled={isRemoving}
                                className='text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors'
                              >
                                {isRemoving ? 'Removing…' : 'Yes'}
                              </button>
                              <button
                                type='button'
                                onClick={() => setConfirmRemovePubkey(null)}
                                className='text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors'
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type='button'
                              onClick={() => setConfirmRemovePubkey(m.pubkey)}
                              className='inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-400 px-2 py-1 rounded transition-colors'
                              title='Remove member'
                            >
                              <Trash2 className='w-3.5 h-3.5' />
                              Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Linked packages */}
      <section>
        <p className='section-heading mb-3'>
          <Package className='w-3.5 h-3.5 inline mr-1.5' />
          Linked packages
        </p>

        {isAdminWithKeypair && (
          <form
            className='mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3'
            onSubmit={handleLinkPackage}
          >
            <p className='text-[12px] font-medium text-neutral-300'>
              Link package
            </p>
            <div>
              <label className='block text-[11px] text-neutral-500 mb-1'>
                Package name
              </label>
              <div className='relative'>
                <input
                  type='text'
                  value={newPackageName}
                  onChange={e => {
                    setNewPackageName(e.target.value);
                    setPackageNameError(null);
                    linkPackageMutation.reset();
                    if (packageNameTouched)
                      setPackageNameError(
                        validateOrgPackageName(e.target.value)
                      );
                  }}
                  onBlur={() => {
                    setPackageNameTouched(true);
                    setPackageNameError(validateOrgPackageName(newPackageName));
                  }}
                  placeholder='e.g. com.example.app'
                  maxLength={ORG_PACKAGE_NAME_MAX}
                  className={`input w-full ${
                    pkgNameErr
                      ? 'border-red-500/70 focus-visible:ring-red-500/30 focus-visible:border-red-500'
                      : ''
                  }`}
                />
                <span className='absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-600 pointer-events-none'>
                  {newPackageName.length}/{ORG_PACKAGE_NAME_MAX}
                </span>
              </div>
              <p className='mt-1 text-[11px] text-neutral-600'>
                Letters, numbers, dots, hyphens, underscores.
              </p>
              {pkgNameErr && (
                <p className='mt-0.5 text-[12px] text-red-400'>{pkgNameErr}</p>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='submit'
                disabled={checkingPackage || linkPackageMutation.isPending}
                className='inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2 text-[13px] font-medium transition-colors'
              >
                <Link2 className='w-3.5 h-3.5' />
                {checkingPackage
                  ? 'Checking…'
                  : linkPackageMutation.isPending
                    ? 'Linking…'
                    : 'Link package'}
              </button>
            </div>
            {linkPackageMutation.isError && (
              <p className='text-[12px] text-red-400'>
                {getApiErrorMessage(linkPackageMutation.error)}
              </p>
            )}
          </form>
        )}

        {packagesLoading ? (
          <div className='space-y-2 animate-pulse'>
            <div className='h-10 bg-neutral-800/50 rounded-xl' />
            <div className='h-10 bg-neutral-800/50 rounded-xl' />
          </div>
        ) : packages.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
            No packages linked to this org.
          </div>
        ) : (
          <ul className='space-y-2'>
            {packages.map(pkg => {
              const isConfirming = confirmUnlinkPkg === pkg;
              const isUnlinking =
                unlinkPackageMutation.isPending &&
                unlinkPackageMutation.variables === pkg;
              return (
                <li key={pkg}>
                  <div className='flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 group hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'>
                    <Link
                      to={`/apps/${encodeURIComponent(pkg)}`}
                      className='flex-1 min-w-0 flex items-center justify-between'
                    >
                      <span className='text-[13px] font-mono text-neutral-300 truncate'>
                        {pkg}
                      </span>
                      <ArrowUpRight className='w-3.5 h-3.5 text-neutral-500 group-hover:text-brand-600 flex-shrink-0 ml-2' />
                    </Link>
                    {isAdmin && (
                      <div className='flex-shrink-0'>
                        {isConfirming ? (
                          <span className='inline-flex items-center gap-2'>
                            <AlertTriangle className='w-3.5 h-3.5 text-amber-500' />
                            <span className='text-[11px] text-neutral-400'>
                              Unlink?
                            </span>
                            <button
                              type='button'
                              onClick={() => unlinkPackageMutation.mutate(pkg)}
                              disabled={isUnlinking}
                              className='text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors'
                            >
                              {isUnlinking ? 'Unlinking…' : 'Yes'}
                            </button>
                            <button
                              type='button'
                              onClick={() => setConfirmUnlinkPkg(null)}
                              className='text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors'
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type='button'
                            onClick={() => setConfirmUnlinkPkg(pkg)}
                            className='inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-400 px-2 py-1 rounded transition-colors'
                            title='Unlink package'
                          >
                            <Unlink className='w-3.5 h-3.5' />
                            Unlink
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Metadata */}
      {(hasMetadata || isAdminWithKeypair) && (
        <section>
          <div className='flex items-center justify-between mb-3'>
            <p className='section-heading'>
              <Settings className='w-3.5 h-3.5 inline mr-1.5' />
              Metadata
            </p>
            {isAdminWithKeypair && !isEditingMetadata && (
              <button
                type='button'
                onClick={handleOpenMetadataEdit}
                className='text-[12px] text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1 transition-colors'
              >
                <Settings className='w-3 h-3' />
                Edit
              </button>
            )}
          </div>

          {isEditingMetadata ? (
            <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3'>
              <textarea
                value={metadataJson}
                onChange={e => {
                  setMetadataJson(e.target.value);
                  setMetadataError('');
                }}
                rows={6}
                spellCheck={false}
                className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2.5 text-[12px] font-mono text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 resize-y'
                placeholder='{"key": "value"}'
              />
              {metadataError && (
                <p className='text-[12px] text-red-400'>{metadataError}</p>
              )}
              {updateOrgMutation.isError && (
                <p className='text-[12px] text-red-400'>
                  {getApiErrorMessage(updateOrgMutation.error)}
                </p>
              )}
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={handleSaveMetadata}
                  disabled={updateOrgMutation.isPending}
                  className='inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2 text-[13px] font-medium transition-colors'
                >
                  <Save className='w-3.5 h-3.5' />
                  {updateOrgMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setIsEditingMetadata(false);
                    setMetadataError('');
                  }}
                  className='inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-neutral-200 px-3 py-2 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors'
                >
                  <X className='w-3.5 h-3.5' />
                  Cancel
                </button>
              </div>
            </div>
          ) : hasMetadata ? (
            <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden'>
              <table className='w-full text-[13px]'>
                <tbody>
                  {Object.entries(org!.metadata!).map(([k, v]) => (
                    <tr
                      key={k}
                      className='border-b border-neutral-800/80 last:border-0'
                    >
                      <td className='py-2.5 px-5 font-mono text-neutral-500 w-1/3'>
                        {k}
                      </td>
                      <td className='py-2.5 px-5 text-neutral-300 break-all'>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
              No metadata set.{' '}
              <button
                type='button'
                onClick={handleOpenMetadataEdit}
                className='text-brand-600 hover:underline'
              >
                Add metadata
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ReadOnlyAdminNotice() {
  return (
    <div className='mb-4 rounded-lg border border-neutral-700/60 bg-neutral-800/30 px-4 py-3 flex items-center gap-3'>
      <AlertTriangle className='w-4 h-4 text-amber-500 flex-shrink-0' />
      <p className='text-[12px] text-neutral-400'>
        You are an admin but your identity is read-only.{' '}
        <Link to='/orgs' className='text-brand-600 hover:underline'>
          Generate a keypair
        </Link>{' '}
        to manage members, packages, and metadata.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to='/orgs'
      className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
    >
      <ArrowLeft className='w-3 h-3' />
      Back to Organizations
    </Link>
  );
}
