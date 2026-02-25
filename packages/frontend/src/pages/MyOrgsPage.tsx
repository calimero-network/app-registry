import { useState, useEffect } from 'react';
import axios from 'axios';
import { getOrgsByMember, createOrg, getMyOrgPubkeyBase64url } from '@/lib/api';
import {
  getStoredKeypair,
  generateKeypair,
  exportSecretKeyBase64url,
  importPublicKey,
  getStoredPublicKeyBase64url,
  clearStoredPublicKey,
} from '@/lib/org-keypair';
import {
  sanitizeText,
  validateOrgName,
  validateOrgSlug,
  ORG_NAME_MAX,
  ORG_SLUG_MAX,
} from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ArrowRight,
  Info,
  Key,
  Plus,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Check,
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
  return 'Failed to create organization.';
}

export default function MyOrgsPage() {
  const [hasKeypair, setHasKeypair] = useState<boolean | null>(null);
  const [hasPubkeyOnly, setHasPubkeyOnly] = useState(false);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, slug: false });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    getStoredKeypair().then(kp => {
      setHasKeypair(!!kp);
      if (!kp) setHasPubkeyOnly(!!getStoredPublicKeyBase64url());
    });
    getMyOrgPubkeyBase64url().then(pk => {
      if (pk) setMyPubkey(pk);
    });
  }, []);

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

  const handleCreateIdentity = async () => {
    clearStoredPublicKey();
    await generateKeypair(true);
    setHasKeypair(true);
    setHasPubkeyOnly(false);
    const pk = await getMyOrgPubkeyBase64url();
    if (pk) setMyPubkey(pk);
  };

  const handleCopySecretKey = async () => {
    const sk = exportSecretKeyBase64url();
    if (!sk) return;
    await navigator.clipboard.writeText(sk);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportPublicKey = () => {
    setImportError('');
    const ok = importPublicKey(importValue);
    if (!ok) {
      setImportError(
        'Invalid public key — must be a base64url-encoded 32-byte Ed25519 public key (43 characters).'
      );
      return;
    }
    setHasPubkeyOnly(true);
    setShowImport(false);
    setImportValue('');
    const pk = getStoredPublicKeyBase64url();
    if (pk) setMyPubkey(pk);
    queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
  };

  const handleNameChange = (value: string) => {
    setCreateName(value);
    if (touched.name) setNameError(validateOrgName(value));
  };

  const handleSlugChange = (value: string) => {
    // Auto-lowercase slug as the user types
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

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs-by-member', myPubkey],
    queryFn: () => getOrgsByMember(myPubkey || ''),
    enabled: !!myPubkey,
  });

  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-semibold text-neutral-100 mb-2'>
          Organizations
        </h1>
        <p className='text-neutral-400 text-sm mb-4'>
          Create and manage organizations with your Ed25519 keypair. Create an
          org identity first, then create orgs and manage members and packages.
        </p>
        <div className='rounded-lg border border-brand-900/60 bg-brand-950/30 px-4 py-3 flex gap-3'>
          <Info className='w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5' />
          <p className='text-[13px] text-neutral-300'>
            Org write operations use a <strong>local Ed25519 keypair</strong>{' '}
            stored in this browser. Create an org identity below to create orgs
            and manage members and packages.
          </p>
        </div>
      </div>

      {/* No identity yet — offer generate or import public key */}
      {hasKeypair === false && !hasPubkeyOnly && (
        <div className='rounded-xl border border-amber-900/60 bg-amber-950/20 p-6'>
          <div className='flex items-center gap-2 mb-3'>
            <Key className='w-4 h-4 text-amber-500' />
            <h2 className='text-[14px] font-medium text-neutral-200'>
              Set up org identity
            </h2>
          </div>
          <p className='text-neutral-400 text-sm mb-4'>
            To view and manage organizations you need an Ed25519 identity.
            Import your <strong className='text-neutral-200'>public key</strong>{' '}
            to view orgs, or generate a full keypair to also create and manage
            orgs from this browser.
          </p>
          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={handleCreateIdentity}
              className='rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 text-sm font-medium transition-colors'
            >
              Generate keypair
            </button>
            <button
              type='button'
              onClick={() => setShowImport(v => !v)}
              className='rounded-lg border border-neutral-700 hover:border-neutral-600 text-neutral-300 px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5'
            >
              <Upload className='w-3.5 h-3.5' />
              Import public key
            </button>
          </div>
          {showImport && (
            <div className='mt-4 space-y-2'>
              <p className='text-[12px] text-neutral-500'>
                Paste the{' '}
                <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
                  public_key
                </code>{' '}
                value from{' '}
                <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
                  mero-sign
                </code>{' '}
                — base64url, 43 characters. No private key is stored.
              </p>
              <input
                type='text'
                value={importValue}
                onChange={e => {
                  setImportValue(e.target.value);
                  setImportError('');
                }}
                placeholder='e.g. 4Vqj1sfgZ_jFKFtq8b2e-Fnc8_1FVwFzwwjr73xiqQg'
                className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none font-mono'
              />
              {importError && (
                <p className='text-red-400 text-[12px]'>{importError}</p>
              )}
              <button
                type='button'
                onClick={handleImportPublicKey}
                disabled={!importValue.trim()}
                className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-neutral-900 px-4 py-2 text-sm font-medium transition-colors'
              >
                Import public key
              </button>
            </div>
          )}
        </div>
      )}

      {/* Public key only — read-only identity */}
      {hasKeypair === false && hasPubkeyOnly && myPubkey && (
        <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4'>
          <div className='flex items-center justify-between mb-2'>
            <div className='flex items-center gap-2'>
              <Key className='w-3.5 h-3.5 text-brand-600' />
              <span className='text-[13px] font-medium text-neutral-300'>
                Your org identity
              </span>
              <span className='pill bg-neutral-700/50 text-neutral-400 text-[10px]'>
                view only
              </span>
            </div>
          </div>
          <p
            className='text-[11px] text-neutral-500 font-mono truncate mb-3'
            title={myPubkey}
          >
            pubkey: {myPubkey}
          </p>
          <p className='text-[12px] text-neutral-500 mb-3'>
            Viewing orgs only. To create or manage organizations, generate a
            keypair in this browser.
          </p>
          <button
            type='button'
            onClick={handleCreateIdentity}
            className='rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 text-[12px] font-medium transition-colors'
          >
            Generate keypair
          </button>
        </div>
      )}

      {/* Keypair management (has keypair) */}
      {hasKeypair === true && myPubkey && (
        <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4'>
          <div className='flex items-center justify-between mb-2'>
            <div className='flex items-center gap-2'>
              <Key className='w-3.5 h-3.5 text-brand-600' />
              <span className='text-[13px] font-medium text-neutral-300'>
                Your org identity
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => setShowSecretKey(v => !v)}
                className='text-[12px] text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1 transition-colors'
                title='Show / hide secret key for backup'
              >
                {showSecretKey ? (
                  <EyeOff className='w-3.5 h-3.5' />
                ) : (
                  <Eye className='w-3.5 h-3.5' />
                )}
                {showSecretKey ? 'Hide key' : 'Export key'}
              </button>
            </div>
          </div>
          <p
            className='text-[11px] text-neutral-500 font-mono truncate mb-1'
            title={myPubkey}
          >
            pubkey: {myPubkey}
          </p>
          {showSecretKey && (
            <div className='mt-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3'>
              <p className='text-[11px] text-amber-400 mb-2'>
                Secret key — store this safely. Anyone with this key can manage
                your organizations.
              </p>
              <div className='flex items-center gap-2'>
                <code className='flex-1 text-[11px] font-mono text-neutral-300 bg-neutral-800 rounded px-2 py-1.5 truncate'>
                  {exportSecretKeyBase64url()}
                </code>
                <button
                  type='button'
                  onClick={handleCopySecretKey}
                  className='flex-shrink-0 text-neutral-400 hover:text-neutral-200 p-1.5 rounded transition-colors'
                  title='Copy secret key'
                >
                  {copied ? (
                    <Check className='w-3.5 h-3.5 text-green-400' />
                  ) : (
                    <Copy className='w-3.5 h-3.5' />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create organization (has keypair) */}
      {hasKeypair === true && (
        <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-6'>
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
                  className={`w-full rounded-lg border bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 transition-colors ${
                    nameError
                      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                      : 'border-neutral-700 focus:border-brand-600 focus:ring-brand-600'
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
                  className={`w-full rounded-lg border bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 font-mono transition-colors ${
                    slugError
                      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                      : 'border-neutral-700 focus:border-brand-600 focus:ring-brand-600'
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
              className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2 text-sm font-medium transition-colors'
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

      {/* Org list */}
      <div>
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          Organizations
        </h2>
        {!myPubkey ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              Set up your org identity above to see your organizations.
            </p>
          </div>
        ) : isLoading ? (
          <div className='space-y-3 animate-pulse'>
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
            <div className='h-14 bg-neutral-800/50 rounded-xl' />
          </div>
        ) : orgs.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              No organizations found for this member.
            </p>
          </div>
        ) : (
          <ul className='space-y-2'>
            {orgs.map(org => (
              <li key={org.id}>
                <Link
                  to={`/orgs/${encodeURIComponent(org.id)}`}
                  className='flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800'>
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
