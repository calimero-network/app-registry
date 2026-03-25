import { useState } from 'react';
import axios from 'axios';
import {
  getOrgsByMember,
  createOrg,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '@/lib/api';
import {
  sanitizeText,
  validateOrgName,
  validateOrgSlug,
  ORG_NAME_MAX,
  ORG_SLUG_MAX,
} from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { ApiToken } from '@/types/api';
import {
  Building2,
  ArrowRight,
  Info,
  Plus,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.error === 'string') return data.error;
    if (error.response?.status === 409)
      return 'An organization with this slug already exists.';
  }
  if (error instanceof Error) return error.message;
  return 'Failed.';
}

export default function MyOrgsPage() {
  const { user } = useAuth();
  const email = user?.email ?? null;

  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, slug: false });

  // Token section
  const [showTokenSection, setShowTokenSection] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs-by-member', email],
    queryFn: () => getOrgsByMember(email || ''),
    enabled: !!email,
  });

  const { data: tokens = [], refetch: refetchTokens } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: listApiTokens,
    enabled: showTokenSection,
  });

  const createOrgMutation = useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      createOrg(sanitizeText(name), sanitizeText(slug).toLowerCase()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
      setCreateName('');
      setCreateSlug('');
      setTouched({ name: false, slug: false });
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: (label: string) => createApiToken(label || 'CLI token'),
    onSuccess: data => {
      setFreshToken(data.token);
      setNewTokenLabel('');
      refetchTokens();
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeApiToken(tokenId),
    onSuccess: () => {
      setRevokeConfirm(null);
      refetchTokens();
    },
  });

  const handleNameChange = (value: string) => {
    setCreateName(value);
    if (touched.name) setNameError(validateOrgName(value));
  };

  const handleSlugChange = (value: string) => {
    const lower = value.toLowerCase();
    setCreateSlug(lower);
    if (touched.slug) setSlugError(validateOrgSlug(lower));
  };

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    const nErr = validateOrgName(createName);
    const sErr = validateOrgSlug(createSlug);
    setNameError(nErr);
    setSlugError(sErr);
    setTouched({ name: true, slug: true });
    if (nErr || sErr) return;
    createOrgMutation.mutate({ name: createName, slug: createSlug });
  };

  const handleCopyToken = async () => {
    if (!freshToken) return;
    await navigator.clipboard.writeText(freshToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleCopyCmd = async () => {
    if (!freshToken) return;
    await navigator.clipboard.writeText(
      `calimero-registry config set api-key ${freshToken}`
    );
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2000);
  };

  return (
    <div className='space-y-8'>
      <div className='animate-fade-in'>
        <h1 className='text-xl font-semibold text-neutral-100 mb-2'>
          Organizations
        </h1>
        <p className='text-[13px] text-neutral-400 font-light mb-4'>
          Create and manage organizations. Log in with Google to create orgs and
          manage members. Use the CLI with an API token for automation.
        </p>
        <div className='rounded-lg border border-brand-900/40 bg-brand-600/[0.04] px-4 py-3 flex gap-3'>
          <Info className='w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5' />
          <p className='text-[13px] text-neutral-300'>
            Org membership is linked to your{' '}
            <strong className='text-neutral-200'>Google account</strong> (
            {email ?? 'not signed in'}). For CLI access, generate an API token
            below.
          </p>
        </div>
      </div>

      {/* Not logged in */}
      {!email && (
        <div className='card p-6 text-center border-amber-900/30'>
          <p className='text-neutral-300 text-sm'>
            Sign in with Google to create and manage organizations.
          </p>
        </div>
      )}

      {/* Create organization */}
      {email && (
        <div className='card p-6 animate-slide-up stagger-1'>
          <div className='flex items-center gap-2 mb-3'>
            <Plus className='w-4 h-4 text-brand-600' />
            <h2 className='text-[14px] font-medium text-neutral-200'>
              Create organization
            </h2>
          </div>
          <form onSubmit={handleCreateOrg} className='space-y-3'>
            <div>
              <div className='relative'>
                <input
                  type='text'
                  value={createName}
                  onChange={e => handleNameChange(e.target.value)}
                  onBlur={() => {
                    setTouched(t => ({ ...t, name: true }));
                    setNameError(validateOrgName(createName));
                  }}
                  placeholder='Organization name'
                  maxLength={ORG_NAME_MAX}
                  className={`w-full rounded-lg border bg-white/[0.06] px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 transition-colors ${
                    nameError
                      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                      : 'border-white/[0.08] focus:border-brand-600 focus:ring-brand-600'
                  }`}
                />
                <span className='absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-600 pointer-events-none'>
                  {createName.length}/{ORG_NAME_MAX}
                </span>
              </div>
              {nameError && (
                <p className='mt-1 text-[12px] text-red-400'>{nameError}</p>
              )}
            </div>
            <div>
              <div className='relative'>
                <input
                  type='text'
                  value={createSlug}
                  onChange={e => handleSlugChange(e.target.value)}
                  onBlur={() => {
                    setTouched(t => ({ ...t, slug: true }));
                    setSlugError(validateOrgSlug(createSlug));
                  }}
                  placeholder='Slug (e.g. my-org)'
                  maxLength={ORG_SLUG_MAX}
                  className={`w-full rounded-lg border bg-white/[0.06] px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 font-mono transition-colors ${
                    slugError
                      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                      : 'border-white/[0.08] focus:border-brand-600 focus:ring-brand-600'
                  }`}
                />
                <span className='absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-600 pointer-events-none'>
                  {createSlug.length}/{ORG_SLUG_MAX}
                </span>
              </div>
              <p className='mt-1 text-[11px] text-neutral-600'>
                Lowercase letters, numbers, and hyphens only.
              </p>
              {slugError && (
                <p className='mt-0.5 text-[12px] text-red-400'>{slugError}</p>
              )}
            </div>
            <button
              type='submit'
              disabled={createOrgMutation.isPending}
              className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-black px-4 py-2 text-sm font-medium transition-colors'
            >
              {createOrgMutation.isPending
                ? 'Creating…'
                : 'Create organization'}
            </button>
            {createOrgMutation.isError && (
              <p className='text-red-400 text-[13px]'>
                {getApiErrorMessage(createOrgMutation.error)}
              </p>
            )}
          </form>
        </div>
      )}

      {/* CLI Access — API Token */}
      {email && (
        <div className='card overflow-hidden animate-slide-up stagger-2'>
          <button
            type='button'
            onClick={() => setShowTokenSection(v => !v)}
            className='w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors'
          >
            <div className='flex items-center gap-2'>
              <Terminal className='w-4 h-4 text-brand-600' />
              <span className='text-[14px] font-medium text-neutral-200'>
                CLI Access
              </span>
              <span className='pill bg-white/[0.06] text-neutral-400 text-[10px]'>
                API token
              </span>
            </div>
            {showTokenSection ? (
              <ChevronUp className='w-4 h-4 text-neutral-500' />
            ) : (
              <ChevronDown className='w-4 h-4 text-neutral-500' />
            )}
          </button>

          {showTokenSection && (
            <div className='px-4 pb-4 space-y-4 border-t border-white/[0.06]'>
              <p className='text-[12px] text-neutral-400 pt-3'>
                Generate a token to authenticate the CLI for org management and
                bundle publishing. Configure it once with:
                <code className='ml-1 bg-white/[0.06] px-1.5 py-0.5 rounded text-neutral-300 text-[11px]'>
                  calimero-registry config set api-key &lt;token&gt;
                </code>
              </p>

              {/* Generate new token */}
              <div className='flex flex-wrap gap-2'>
                <input
                  type='text'
                  value={newTokenLabel}
                  onChange={e => setNewTokenLabel(e.target.value)}
                  placeholder='Token label (e.g. laptop)'
                  className='flex-1 min-w-[160px] rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none'
                />
                <button
                  type='button'
                  onClick={() =>
                    createTokenMutation.mutate(newTokenLabel || 'CLI token')
                  }
                  disabled={createTokenMutation.isPending}
                  className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-black px-4 py-2 text-[13px] font-medium transition-colors whitespace-nowrap'
                >
                  {createTokenMutation.isPending
                    ? 'Generating…'
                    : 'Generate token'}
                </button>
              </div>

              {/* Fresh token display — shown once */}
              {freshToken && (
                <div className='rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 space-y-2'>
                  <div className='flex items-center gap-1.5 text-[12px] text-amber-400'>
                    <AlertTriangle className='w-3.5 h-3.5 flex-shrink-0' />
                    Copy this token now — it will not be shown again.
                  </div>
                  <div className='flex items-center gap-2'>
                    <code className='flex-1 text-[11px] font-mono text-neutral-300 bg-white/[0.06] rounded px-2 py-1.5 truncate'>
                      {freshToken}
                    </code>
                    <button
                      type='button'
                      onClick={handleCopyToken}
                      className='flex-shrink-0 text-neutral-400 hover:text-neutral-200 p-1.5 rounded transition-colors'
                      title='Copy token'
                    >
                      {tokenCopied ? (
                        <Check className='w-3.5 h-3.5 text-green-400' />
                      ) : (
                        <Copy className='w-3.5 h-3.5' />
                      )}
                    </button>
                  </div>
                  <div className='flex items-center gap-2'>
                    <code className='flex-1 text-[11px] font-mono text-neutral-500 bg-white/[0.06] rounded px-2 py-1.5 truncate'>
                      calimero-registry config set api-key {freshToken}
                    </code>
                    <button
                      type='button'
                      onClick={handleCopyCmd}
                      className='flex-shrink-0 text-neutral-400 hover:text-neutral-200 p-1.5 rounded transition-colors'
                      title='Copy CLI command'
                    >
                      {cmdCopied ? (
                        <Check className='w-3.5 h-3.5 text-green-400' />
                      ) : (
                        <Copy className='w-3.5 h-3.5' />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing tokens list */}
              {tokens.length > 0 && (
                <div className='space-y-1'>
                  <p className='text-[11px] text-neutral-500 uppercase tracking-wide'>
                    Active tokens
                  </p>
                  {tokens.map((t: ApiToken) => (
                    <div
                      key={t.tokenId}
                      className='flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2'
                    >
                      <div>
                        <span className='text-[13px] text-neutral-300'>
                          {t.label}
                        </span>
                        <span className='ml-2 text-[11px] text-neutral-600 font-mono'>
                          {t.token}
                        </span>
                      </div>
                      <div className='flex items-center gap-3'>
                        <span className='text-[11px] text-neutral-600'>
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                        {revokeConfirm === t.tokenId ? (
                          <span className='flex items-center gap-2 text-[11px]'>
                            <button
                              type='button'
                              onClick={() =>
                                revokeTokenMutation.mutate(t.tokenId)
                              }
                              disabled={revokeTokenMutation.isPending}
                              className='text-red-400 hover:text-red-300 font-medium disabled:opacity-50'
                            >
                              {revokeTokenMutation.isPending
                                ? 'Revoking…'
                                : 'Yes, revoke'}
                            </button>
                            <button
                              type='button'
                              onClick={() => setRevokeConfirm(null)}
                              className='text-neutral-500 hover:text-neutral-300'
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type='button'
                            onClick={() => setRevokeConfirm(t.tokenId)}
                            className='text-neutral-600 hover:text-red-400 transition-colors'
                            title='Revoke token'
                          >
                            <Trash2 className='w-3.5 h-3.5' />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {createTokenMutation.isError && (
                <p className='text-red-400 text-[12px]'>
                  {getApiErrorMessage(createTokenMutation.error)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Org list */}
      <div>
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          <Building2 className='w-3.5 h-3.5 inline mr-1.5' />
          Organizations
        </h2>
        {!email ? (
          <div className='card p-8 text-center'>
            <Building2 className='h-8 w-8 text-neutral-600 mx-auto mb-4' />
            <p className='text-[13px] text-neutral-400 font-light'>
              Sign in with Google to see your organizations.
            </p>
          </div>
        ) : isLoading ? (
          <div className='space-y-3 animate-pulse'>
            <div className='h-14 bg-white/[0.04] rounded-xl' />
            <div className='h-14 bg-white/[0.04] rounded-xl' />
            <div className='h-14 bg-white/[0.04] rounded-xl' />
          </div>
        ) : orgs.length === 0 ? (
          <div className='card p-8 text-center'>
            <Building2 className='h-8 w-8 text-neutral-600 mx-auto mb-4' />
            <p className='text-[13px] text-neutral-400 font-light'>
              No organizations yet. Create one above.
            </p>
          </div>
        ) : (
          <ul className='space-y-2'>
            {orgs.map(org => (
              <li key={org.id}>
                <Link
                  to={`/orgs/${encodeURIComponent(org.id)}`}
                  className='card flex items-center justify-between px-4 py-3 hover:border-brand-600/30'
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.06]'>
                      <Building2 className='w-4 h-4 text-neutral-400' />
                    </div>
                    <div>
                      <span className='text-neutral-200 font-medium'>
                        {org.name}
                      </span>
                      {org.slug && (
                        <span className='text-neutral-500 text-sm ml-2 font-mono'>
                          {org.slug}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className='w-4 h-4 text-neutral-500' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
