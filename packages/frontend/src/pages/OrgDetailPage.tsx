import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@/lib/api';
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
} from 'lucide-react';

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
  const [newMemberPubkey, setNewMemberPubkey] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [newPackageName, setNewPackageName] = useState('');
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    getMyOrgPubkeyBase64url().then(setMyPubkey);
  }, []);

  const { data: org, isLoading: orgLoading, error: orgError } = useQuery({
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

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrgMember(decodedOrgId, newMemberPubkey.trim(), newMemberRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', decodedOrgId] });
      setNewMemberPubkey('');
      setNewMemberRole('member');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberPubkey: string) =>
      removeOrgMember(decodedOrgId, memberPubkey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', decodedOrgId] });
    },
  });

  const linkPackageMutation = useMutation({
    mutationFn: () => linkOrgPackage(decodedOrgId, newPackageName.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-packages', decodedOrgId] });
      setNewPackageName('');
    },
  });

  const unlinkPackageMutation = useMutation({
    mutationFn: (packageName: string) =>
      unlinkOrgPackage(decodedOrgId, packageName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-packages', decodedOrgId] });
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
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setMetadataError('Must be a JSON object, e.g. {"key": "value"}');
        return;
      }
    } catch {
      setMetadataError('Invalid JSON');
      return;
    }
    updateOrgMutation.mutate(parsed);
  };

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
      <div>
        <p className='section-heading mb-3'>
          <Users className='w-3.5 h-3.5 inline mr-1.5' />
          Members
        </p>
        {isAdmin && (
          <form
            className='mb-3 flex flex-wrap items-end gap-2'
            onSubmit={e => {
              e.preventDefault();
              if (!newMemberPubkey.trim() || !isValidPubkeyFormat(newMemberPubkey)) return;
              addMemberMutation.mutate();
            }}
          >
            <div className='flex-1 min-w-[200px]'>
              <label className='block text-[11px] text-neutral-500 mb-1'>
                Pubkey (base64url or base58)
              </label>
              <input
                type='text'
                value={newMemberPubkey}
                onChange={e => setNewMemberPubkey(e.target.value)}
                placeholder='New member pubkey'
                className={`input w-full ${
                  newMemberPubkey.trim() && !isValidPubkeyFormat(newMemberPubkey)
                    ? 'border-red-600 focus:border-red-500 focus:ring-red-500'
                    : ''
                }`}
              />
              {newMemberPubkey.trim() && !isValidPubkeyFormat(newMemberPubkey) && (
                <p className='mt-1 text-[11px] text-red-400'>
                  Must be a base64url (43 chars) or base58 (43–44 chars) Ed25519 public key.
                </p>
              )}
            </div>
            <div className='w-28'>
              <label className='block text-[11px] text-neutral-500 mb-1'>
                Role
              </label>
              <select
                value={newMemberRole}
                onChange={e =>
                  setNewMemberRole(e.target.value as 'admin' | 'member')
                }
                className='input w-full'
              >
                <option value='member'>member</option>
                <option value='admin'>admin</option>
              </select>
            </div>
            <button
              type='submit'
              disabled={
                !newMemberPubkey.trim() ||
                !isValidPubkeyFormat(newMemberPubkey) ||
                addMemberMutation.isPending
              }
              className='btn-primary inline-flex items-center gap-1.5'
            >
              <UserPlus className='w-3.5 h-3.5' />
              {addMemberMutation.isPending ? 'Adding…' : 'Add member'}
            </button>
            {addMemberMutation.isError && (
              <p className='w-full text-[12px] text-red-400'>
                {addMemberMutation.error instanceof Error
                  ? addMemberMutation.error.message
                  : 'Failed to add member'}
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
                  <th className='text-left py-3 px-4 font-medium text-neutral-300'>
                    Pubkey
                  </th>
                  <th className='text-left py-3 px-4 font-medium text-neutral-300 w-24'>
                    Role
                  </th>
                  {isAdmin && (
                    <th className='text-right py-3 px-4 font-medium text-neutral-300 w-20'>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const isRemoving =
                    removeMemberMutation.isPending &&
                    removeMemberMutation.variables === m.pubkey;
                  return (
                    <tr
                      key={m.pubkey}
                      className='border-b border-neutral-800/80 last:border-0'
                    >
                      <td className='py-2.5 px-4 font-mono text-neutral-400 truncate max-w-[280px]'>
                        {m.pubkey}
                        {m.pubkey === myPubkey && (
                          <span className='ml-2 text-[10px] text-brand-600 font-sans'>(you)</span>
                        )}
                      </td>
                      <td className='py-2.5 px-4'>
                        {m.role === 'admin' ? (
                          <span className='inline-flex items-center gap-1 pill bg-amber-500/10 text-amber-500'>
                            <Shield className='w-3 h-3' />
                            admin
                          </span>
                        ) : (
                          <span className='pill bg-neutral-700/50 text-neutral-400'>
                            member
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className='py-2.5 px-4 text-right'>
                          <button
                            type='button'
                            onClick={() => removeMemberMutation.mutate(m.pubkey)}
                            disabled={isRemoving}
                            className='text-neutral-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed p-1 rounded transition-colors'
                            title='Remove member'
                          >
                            {isRemoving ? (
                              <span className='inline-block w-3.5 h-3.5 border border-neutral-500 border-t-transparent rounded-full animate-spin' />
                            ) : (
                              <Trash2 className='w-3.5 h-3.5' />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Linked packages */}
      <div>
        <p className='section-heading mb-3'>
          <Package className='w-3.5 h-3.5 inline mr-1.5' />
          Linked packages
        </p>
        {isAdmin && (
          <form
            className='mb-3 flex flex-wrap items-end gap-2'
            onSubmit={e => {
              e.preventDefault();
              if (!newPackageName.trim()) return;
              linkPackageMutation.mutate();
            }}
          >
            <div className='flex-1 min-w-[200px]'>
              <label className='block text-[11px] text-neutral-500 mb-1'>
                Package name
              </label>
              <input
                type='text'
                value={newPackageName}
                onChange={e => setNewPackageName(e.target.value)}
                placeholder='e.g. com.example.app'
                className='input w-full'
              />
            </div>
            <button
              type='submit'
              disabled={!newPackageName.trim() || linkPackageMutation.isPending}
              className='btn-primary inline-flex items-center gap-1.5'
            >
              <Link2 className='w-3.5 h-3.5' />
              {linkPackageMutation.isPending ? 'Linking…' : 'Link package'}
            </button>
            {linkPackageMutation.isError && (
              <p className='w-full text-[12px] text-red-400'>
                {linkPackageMutation.error instanceof Error
                  ? linkPackageMutation.error.message
                  : 'Failed to link package'}
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
              const isUnlinking =
                unlinkPackageMutation.isPending &&
                unlinkPackageMutation.variables === pkg;
              return (
                <li key={pkg}>
                  <div className='flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 group hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'>
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
                      <button
                        type='button'
                        onClick={() => unlinkPackageMutation.mutate(pkg)}
                        disabled={isUnlinking}
                        className='text-neutral-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed p-1 rounded flex-shrink-0 transition-colors'
                        title='Unlink package'
                      >
                        {isUnlinking ? (
                          <span className='inline-block w-3.5 h-3.5 border border-neutral-500 border-t-transparent rounded-full animate-spin' />
                        ) : (
                          <Unlink className='w-3.5 h-3.5' />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Metadata */}
      {(hasMetadata || isAdmin) && (
        <div>
          <div className='flex items-center justify-between mb-3'>
            <p className='section-heading'>
              <Settings className='w-3.5 h-3.5 inline mr-1.5' />
              Metadata
            </p>
            {isAdmin && !isEditingMetadata && (
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
                onChange={e => { setMetadataJson(e.target.value); setMetadataError(''); }}
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
                  {updateOrgMutation.error instanceof Error
                    ? updateOrgMutation.error.message
                    : 'Failed to save metadata'}
                </p>
              )}
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={handleSaveMetadata}
                  disabled={updateOrgMutation.isPending}
                  className='btn-primary inline-flex items-center gap-1.5 text-[13px]'
                >
                  <Save className='w-3.5 h-3.5' />
                  {updateOrgMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type='button'
                  onClick={() => { setIsEditingMetadata(false); setMetadataError(''); }}
                  className='inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-neutral-200 px-3 py-1.5 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors'
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
                    <tr key={k} className='border-b border-neutral-800/80 last:border-0'>
                      <td className='py-2.5 px-4 font-mono text-neutral-500 w-1/3'>{k}</td>
                      <td className='py-2.5 px-4 text-neutral-300 break-all'>
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
        </div>
      )}
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
