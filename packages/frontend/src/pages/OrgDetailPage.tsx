import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
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
  deleteOrg,
  api,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
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
  Globe,
  Mail,
  Github,
  Twitter,
  MapPin,
  ExternalLink,
  BadgeCheck,
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

export default function OrgDetailPage() {
  const { orgId = '' } = useParams<{ orgId: string }>();
  const decodedOrgId = decodeURIComponent(orgId);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Add member form
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>(
    'member'
  );
  const [memberUsernameTouched, setMemberUsernameTouched] = useState(false);
  const USERNAME_REGEX = /^[a-z0-9]([a-z0-9_-]{0,48}[a-z0-9])?$/;

  const isValidUsername = (value: string) =>
    USERNAME_REGEX.test(value.trim().replace(/^@+/, '').toLowerCase());

  // Link package form
  const [newPackageName, setNewPackageName] = useState('');
  const [packageNameTouched, setPackageNameTouched] = useState(false);
  const [packageNameError, setPackageNameError] = useState<string | null>(null);
  const [checkingPackage, setCheckingPackage] = useState(false);

  // Settings edit (name + structured metadata fields)
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    website: '',
    email: '',
    github: '',
    twitter: '',
    location: '',
  });

  // Confirmation dialogs for destructive actions
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState<string | null>(
    null
  );
  const [confirmUnlinkPkg, setConfirmUnlinkPkg] = useState<string | null>(null);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);

  const queryClient = useQueryClient();

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
  const userEmailNorm = user?.email?.toLowerCase() ?? '';
  const isAdmin =
    !!user?.email &&
    members.some(
      m =>
        m.email.toLowerCase() === userEmailNorm &&
        (m.role === 'admin' || m.role === 'owner')
    );
  const isOwner =
    !!user?.email &&
    members.some(
      m => m.email.toLowerCase() === userEmailNorm && m.role === 'owner'
    );
  /** Any member of the org (owner, admin, or regular member). */
  const isMember =
    !!user?.email && members.some(m => m.email.toLowerCase() === userEmailNorm);

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrgMember(
        decodedOrgId,
        sanitizeText(newMemberUsername.trim()),
        newMemberRole
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['org-members', decodedOrgId],
      });
      setNewMemberUsername('');
      setNewMemberRole('member');
      setMemberUsernameTouched(false);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberEmail: string) =>
      removeOrgMember(decodedOrgId, memberEmail),
    onSuccess: (_, memberEmail) => {
      setConfirmRemoveEmail(null);
      if (memberEmail.toLowerCase() === userEmailNorm) {
        navigate('/orgs');
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ['org-members', decodedOrgId],
      });
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
    mutationFn: ({
      name,
      metadata,
    }: {
      name: string;
      metadata: Record<string, string>;
    }) => updateOrg(decodedOrgId, { name, metadata }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', decodedOrgId] });
      setIsEditingSettings(false);
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => deleteOrg(decodedOrgId),
    onSuccess: () => {
      navigate('/orgs');
    },
  });

  const handleOpenSettingsEdit = () => {
    const m = org?.metadata ?? {};
    setSettingsForm({
      name: org?.name ?? '',
      description: String(m.description ?? ''),
      website: String(m.website ?? ''),
      email: String(m.email ?? ''),
      github: String(m.github ?? ''),
      twitter: String(m.twitter ?? ''),
      location: String(m.location ?? ''),
    });
    setIsEditingSettings(true);
  };

  const handleSaveSettings = () => {
    const metadata: Record<string, string> = {};
    if (settingsForm.description.trim())
      metadata.description = settingsForm.description.trim();
    if (settingsForm.website.trim())
      metadata.website = settingsForm.website.trim();
    if (settingsForm.email.trim()) metadata.email = settingsForm.email.trim();
    if (settingsForm.github.trim())
      metadata.github = settingsForm.github.trim();
    if (settingsForm.twitter.trim())
      metadata.twitter = settingsForm.twitter.trim();
    if (settingsForm.location.trim())
      metadata.location = settingsForm.location.trim();
    updateOrgMutation.mutate({
      name: settingsForm.name.trim() || (org?.name ?? ''),
      metadata,
    });
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberUsernameTouched(true);
    if (!newMemberUsername.trim() || !isValidUsername(newMemberUsername))
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

  const memberUsernameErr =
    memberUsernameTouched && newMemberUsername.trim()
      ? isValidUsername(newMemberUsername)
        ? null
        : 'Must be a valid username.'
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

  const m = org!.metadata ?? {};
  const hasOrgInfo = !!(
    m.description ||
    m.website ||
    m.email ||
    m.github ||
    m.twitter ||
    m.location
  );

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

      {/* Member notice — shown to regular members (non-admin) */}
      {isMember && !isAdmin && (
        <div className='rounded-lg border border-brand-900/50 bg-brand-950/20 px-4 py-3 flex gap-3'>
          <Users className='w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5' />
          <div className='space-y-1'>
            <p className='text-[13px] text-neutral-200 font-medium'>
              You are a member of this organization
            </p>
            <p className='text-[12px] text-neutral-400'>
              As a member you can publish new versions and edit metadata for any
              of the{' '}
              {packages.length > 0 ? (
                <strong className='text-neutral-300'>{packages.length}</strong>
              ) : (
                'linked'
              )}{' '}
              package{packages.length !== 1 ? 's' : ''} linked to this org via
              the CLI. Package deletion and org management require admin access.
            </p>
          </div>
        </div>
      )}

      {/* Members */}
      <section>
        <p className='section-heading mb-3'>
          <Users className='w-3.5 h-3.5 inline mr-1.5' />
          Members
        </p>

        {isAdmin && (
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
                  Username
                </label>
                <input
                  type='text'
                  value={newMemberUsername}
                  onChange={e => {
                    setNewMemberUsername(e.target.value);
                    if (memberUsernameTouched && e.target.value.trim())
                      setMemberUsernameTouched(true);
                  }}
                  onBlur={() => setMemberUsernameTouched(true)}
                  placeholder='username'
                  className={`input w-full ${
                    memberUsernameErr
                      ? 'border-red-500/70 focus-visible:ring-red-500/30 focus-visible:border-red-500'
                      : ''
                  }`}
                />
                {memberUsernameErr && (
                  <p className='mt-1 text-[11px] text-red-400'>
                    {memberUsernameErr}
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
                    Member
                  </th>
                  <th className='text-left py-3 px-5 font-medium text-neutral-300 w-28'>
                    Role
                  </th>
                  {(isAdmin || isMember) && (
                    <th className='text-right py-3 px-5 font-medium text-neutral-300 w-32'>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map(member => {
                  const isConfirming = confirmRemoveEmail === member.email;
                  const isRemoving =
                    removeMemberMutation.isPending &&
                    removeMemberMutation.variables === member.email;
                  const isCurrentUserRow =
                    member.email.toLowerCase() === userEmailNorm;
                  return (
                    <tr
                      key={member.email}
                      className='border-b border-neutral-800/80 last:border-0'
                    >
                      <td className='py-3 px-5 text-neutral-400 truncate max-w-[280px]'>
                        <span className='inline-flex items-center gap-1.5'>
                          <span className='font-mono'>
                            {member.username
                              ? `@${member.username}`
                              : '(no username)'}
                          </span>
                          {member.verified && (
                            <BadgeCheck className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400' />
                          )}
                          {isCurrentUserRow && (
                            <span className='text-[10px] text-brand-600'>
                              (you)
                            </span>
                          )}
                        </span>
                      </td>
                      <td className='py-3 px-5'>
                        {member.role === 'owner' ? (
                          <span className='inline-flex items-center gap-1 pill bg-emerald-500/10 text-emerald-400'>
                            <Shield className='w-3 h-3' />
                            Owner
                          </span>
                        ) : member.role === 'admin' ? (
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
                      {(isAdmin || isMember) && (
                        <td className='py-3 px-5 text-right'>
                          {isConfirming ? (
                            <span className='inline-flex items-center gap-2'>
                              <span className='text-[11px] text-neutral-400'>
                                {isCurrentUserRow ? 'Leave?' : 'Remove?'}
                              </span>
                              <button
                                type='button'
                                onClick={() =>
                                  removeMemberMutation.mutate(member.email)
                                }
                                disabled={isRemoving}
                                className='text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors'
                              >
                                {isRemoving
                                  ? isCurrentUserRow
                                    ? 'Leaving…'
                                    : 'Removing…'
                                  : 'Yes'}
                              </button>
                              <button
                                type='button'
                                onClick={() => setConfirmRemoveEmail(null)}
                                className='text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors'
                              >
                                Cancel
                              </button>
                            </span>
                          ) : isCurrentUserRow ? (
                            <button
                              type='button'
                              onClick={() =>
                                setConfirmRemoveEmail(member.email)
                              }
                              className='inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-400 px-2 py-1 rounded transition-colors'
                              title='Leave organization'
                            >
                              <Trash2 className='w-3.5 h-3.5' />
                              Leave
                            </button>
                          ) : isAdmin ? (
                            <button
                              type='button'
                              onClick={() =>
                                setConfirmRemoveEmail(member.email)
                              }
                              className='inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-400 px-2 py-1 rounded transition-colors'
                              title='Remove member'
                            >
                              <Trash2 className='w-3.5 h-3.5' />
                              Remove
                            </button>
                          ) : null}
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

        {isAdmin && (
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

      {/* About / Settings */}
      {(hasOrgInfo || isAdmin) && (
        <section>
          <div className='flex items-center justify-between mb-3'>
            <p className='section-heading'>
              <Settings className='w-3.5 h-3.5 inline mr-1.5' />
              About
            </p>
            {isAdmin && !isEditingSettings && (
              <button
                type='button'
                onClick={handleOpenSettingsEdit}
                className='text-[12px] text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1 transition-colors'
              >
                <Settings className='w-3 h-3' />
                Edit
              </button>
            )}
          </div>

          {isEditingSettings ? (
            <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3'>
              <SettingsField
                label='Display name'
                value={settingsForm.name}
                onChange={v => setSettingsForm(f => ({ ...f, name: v }))}
                placeholder={org!.name}
              />
              <SettingsField
                label='Description'
                value={settingsForm.description}
                onChange={v => setSettingsForm(f => ({ ...f, description: v }))}
                placeholder='What does this org build?'
                multiline
              />
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <SettingsField
                  label='Website'
                  value={settingsForm.website}
                  onChange={v => setSettingsForm(f => ({ ...f, website: v }))}
                  placeholder='https://example.com'
                />
                <SettingsField
                  label='Email'
                  value={settingsForm.email}
                  onChange={v => setSettingsForm(f => ({ ...f, email: v }))}
                  placeholder='contact@example.com'
                />
                <SettingsField
                  label='GitHub'
                  value={settingsForm.github}
                  onChange={v => setSettingsForm(f => ({ ...f, github: v }))}
                  placeholder='https://github.com/my-org'
                />
                <SettingsField
                  label='Twitter / X'
                  value={settingsForm.twitter}
                  onChange={v => setSettingsForm(f => ({ ...f, twitter: v }))}
                  placeholder='https://x.com/myorg'
                />
                <SettingsField
                  label='Location'
                  value={settingsForm.location}
                  onChange={v => setSettingsForm(f => ({ ...f, location: v }))}
                  placeholder='City, Country'
                />
              </div>
              {updateOrgMutation.isError && (
                <p className='text-[12px] text-red-400'>
                  {getApiErrorMessage(updateOrgMutation.error)}
                </p>
              )}
              <div className='flex gap-2 pt-1'>
                <button
                  type='button'
                  onClick={handleSaveSettings}
                  disabled={updateOrgMutation.isPending}
                  className='inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2 text-[13px] font-medium transition-colors'
                >
                  <Save className='w-3.5 h-3.5' />
                  {updateOrgMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type='button'
                  onClick={() => setIsEditingSettings(false)}
                  className='inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-neutral-200 px-3 py-2 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors'
                >
                  <X className='w-3.5 h-3.5' />
                  Cancel
                </button>
              </div>
            </div>
          ) : hasOrgInfo ? (
            <div className='card p-4 space-y-2'>
              {m.description && (
                <p className='text-[13px] text-neutral-300 leading-relaxed mb-3'>
                  {m.description}
                </p>
              )}
              {m.website && (
                <OrgInfoRow
                  icon={Globe}
                  label='Website'
                  value={m.website}
                  href={m.website}
                />
              )}
              {m.email && (
                <OrgInfoRow
                  icon={Mail}
                  label='Email'
                  value={m.email}
                  href={`mailto:${m.email}`}
                />
              )}
              {m.github && (
                <OrgInfoRow
                  icon={Github}
                  label='GitHub'
                  value={m.github}
                  href={m.github}
                />
              )}
              {m.twitter && (
                <OrgInfoRow
                  icon={Twitter}
                  label='Twitter / X'
                  value={m.twitter}
                  href={m.twitter}
                />
              )}
              {m.location && (
                <OrgInfoRow icon={MapPin} label='Location' value={m.location} />
              )}
            </div>
          ) : (
            <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
              No info set.{' '}
              <button
                type='button'
                onClick={handleOpenSettingsEdit}
                className='text-brand-600 hover:underline'
              >
                Add info
              </button>
            </div>
          )}
        </section>
      )}

      {/* Danger Zone — owner only */}
      {isOwner && (
        <section className='card p-4 border-red-900/30'>
          <p className='section-heading mb-3 text-red-400/80'>Danger Zone</p>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <p className='text-[13px] text-neutral-300'>
                Delete organization
              </p>
              <p className='text-[12px] text-neutral-500'>
                Permanently deletes{' '}
                <span className='font-mono'>{org!.slug || org!.name}</span> and
                all its members and package links. This cannot be undone.
              </p>
            </div>
            {confirmDeleteOrg ? (
              <span className='flex items-center gap-2 text-[12px] flex-shrink-0'>
                <span className='text-red-400'>Are you sure?</span>
                <button
                  type='button'
                  onClick={() => deleteOrgMutation.mutate()}
                  disabled={deleteOrgMutation.isPending}
                  className='text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50'
                >
                  {deleteOrgMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type='button'
                  onClick={() => setConfirmDeleteOrg(false)}
                  disabled={deleteOrgMutation.isPending}
                  className='text-neutral-500 hover:text-neutral-300 transition-colors'
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type='button'
                onClick={() => setConfirmDeleteOrg(true)}
                className='inline-flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-400 border border-red-900/50 hover:border-red-700/60 px-3 py-1.5 rounded-lg transition-all flex-shrink-0'
              >
                <Trash2 className='w-3.5 h-3.5' />
                Delete org
              </button>
            )}
          </div>
          {deleteOrgMutation.isError && (
            <p className='mt-2 text-[12px] text-red-400'>
              {getApiErrorMessage(deleteOrgMutation.error)}
            </p>
          )}
        </section>
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

function SettingsField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls =
    'w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 transition-colors';
  return (
    <div>
      <label className='block text-[11px] text-neutral-500 mb-1'>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${cls} resize-y`}
        />
      ) : (
        <input
          type='text'
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function OrgInfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className='flex items-center gap-2.5 text-[13px]'>
      <Icon className='w-3.5 h-3.5 text-neutral-500 flex-shrink-0' />
      <span className='text-neutral-500 w-20 flex-shrink-0 text-[12px]'>
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='text-brand-500 hover:text-brand-400 hover:underline truncate inline-flex items-center gap-1 transition-colors'
        >
          {value}
          <ExternalLink className='w-3 h-3 flex-shrink-0' />
        </a>
      ) : (
        <span className='text-neutral-300 truncate'>{value}</span>
      )}
    </div>
  );
}
