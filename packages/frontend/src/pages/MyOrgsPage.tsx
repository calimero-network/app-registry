import { useState, useEffect } from 'react';
import { getOrgsByMember, createOrg, getMyOrgPubkeyBase64url } from '@/lib/api';
import {
  getStoredKeypair,
  generateKeypair,
  exportSecretKeyBase64url,
  importSecretKey,
} from '@/lib/org-keypair';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ArrowRight,
  Search,
  Info,
  Key,
  Plus,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';

export default function MyOrgsPage() {
  const [pubkey, setPubkey] = useState('');
  const [hasKeypair, setHasKeypair] = useState<boolean | null>(null);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    getStoredKeypair().then(kp => setHasKeypair(!!kp));
    getMyOrgPubkeyBase64url().then(pk => {
      if (pk) {
        setMyPubkey(pk);
        setPubkey(prev => (prev.trim() ? prev : pk));
      }
    });
  }, []);

  const createOrgMutation = useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      createOrg(name.trim(), slug.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
      setCreateName('');
      setCreateSlug('');
    },
  });

  const handleCreateIdentity = async () => {
    await generateKeypair(true);
    setHasKeypair(true);
    const pk = await getMyOrgPubkeyBase64url();
    if (pk) {
      setMyPubkey(pk);
      setPubkey(pk);
    }
  };

  const handleCopySecretKey = async () => {
    const sk = exportSecretKeyBase64url();
    if (!sk) return;
    await navigator.clipboard.writeText(sk);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportKey = async () => {
    setImportError('');
    const kp = await importSecretKey(importValue);
    if (!kp) {
      setImportError(
        'Invalid key — must be a base64url-encoded 32-byte secret.'
      );
      return;
    }
    setHasKeypair(true);
    setShowImport(false);
    setImportValue('');
    const pk = await getMyOrgPubkeyBase64url();
    if (pk) {
      setMyPubkey(pk);
      setPubkey(pk);
    }
    queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
  };

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createSlug.trim()) return;
    createOrgMutation.mutate({
      name: createName.trim(),
      slug: createSlug.trim(),
    });
  };

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs-by-member', pubkey.trim()],
    queryFn: () => getOrgsByMember(pubkey.trim()),
    enabled: pubkey.trim().length > 0,
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
            and manage members and packages. See{' '}
            <code className='text-neutral-400'>setup.md</code> and{' '}
            <code className='text-neutral-400'>docs/organizations.md</code> for
            details.
          </p>
        </div>
      </div>

      {/* Create org identity (no keypair) */}
      {hasKeypair === false && (
        <div className='rounded-xl border border-amber-900/60 bg-amber-950/20 p-6'>
          <div className='flex items-center gap-2 mb-3'>
            <Key className='w-4 h-4 text-amber-500' />
            <h2 className='text-[14px] font-medium text-neutral-200'>
              Create org identity
            </h2>
          </div>
          <p className='text-neutral-400 text-sm mb-4'>
            Generate a local Ed25519 keypair to sign org requests. It is stored
            in this browser only —{' '}
            <strong className='text-amber-400'>export and back it up</strong>{' '}
            after creating.
          </p>
          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={handleCreateIdentity}
              className='rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 text-sm font-medium transition-colors'
            >
              Create org identity
            </button>
            <button
              type='button'
              onClick={() => setShowImport(v => !v)}
              className='rounded-lg border border-neutral-700 hover:border-neutral-600 text-neutral-300 px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5'
            >
              <Upload className='w-3.5 h-3.5' />
              Import existing key
            </button>
          </div>
          {showImport && (
            <div className='mt-4 space-y-2'>
              <input
                type='text'
                value={importValue}
                onChange={e => {
                  setImportValue(e.target.value);
                  setImportError('');
                }}
                placeholder='Paste base64url secret key…'
                className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none font-mono'
              />
              {importError && (
                <p className='text-red-400 text-[12px]'>{importError}</p>
              )}
              <button
                type='button'
                onClick={handleImportKey}
                disabled={!importValue.trim()}
                className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition-colors'
              >
                Import key
              </button>
            </div>
          )}
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
            <input
              type='text'
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder='Organization name'
              className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600'
            />
            <input
              type='text'
              value={createSlug}
              onChange={e => setCreateSlug(e.target.value)}
              placeholder='Slug (e.g. my-org)'
              className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600'
            />
            <button
              type='submit'
              disabled={
                !createName.trim() ||
                !createSlug.trim() ||
                createOrgMutation.isPending
              }
              className='rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium transition-colors'
            >
              {createOrgMutation.isPending
                ? 'Creating…'
                : 'Create organization'}
            </button>
            {createOrgMutation.isError && (
              <p className='text-red-400 text-sm'>
                {createOrgMutation.error instanceof Error
                  ? createOrgMutation.error.message
                  : 'Failed to create organization'}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Pubkey input */}
      <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-6'>
        <div className='flex items-center gap-2 mb-3'>
          <Search className='w-4 h-4 text-brand-600' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Look up organizations by member
          </h2>
        </div>
        <input
          type='text'
          value={pubkey}
          onChange={e => setPubkey(e.target.value)}
          placeholder='e.g. 5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9c...'
          className='w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600'
        />
      </div>

      {/* Org list */}
      <div>
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          Organizations
        </h2>
        {!pubkey.trim() ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              Enter a member public key above to see their organizations.
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
