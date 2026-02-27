import { useState, useEffect } from 'react';
import { getOrgsByMember, getMyOrgPubkeyBase64url } from '@/lib/api';
import {
  importPublicKey,
  getStoredPublicKeyBase64url,
  clearStoredPublicKey,
} from '@/lib/org-keypair';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ArrowRight,
  Info,
  Key,
  Upload,
  Terminal,
} from 'lucide-react';

export default function MyOrgsPage() {
  const [hasPubkey, setHasPubkey] = useState<boolean | null>(null);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    setHasPubkey(!!getStoredPublicKeyBase64url());
    getMyOrgPubkeyBase64url().then(pk => {
      if (pk) setMyPubkey(pk);
    });
  }, []);

  const handleImportPublicKey = () => {
    setImportError('');
    const ok = importPublicKey(importValue);
    if (!ok) {
      setImportError(
        'Invalid public key — must be a base64url-encoded 32-byte Ed25519 public key (43 characters).'
      );
      return;
    }
    setHasPubkey(true);
    setShowImport(false);
    setImportValue('');
    const pk = getStoredPublicKeyBase64url();
    if (pk) setMyPubkey(pk);
    queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
  };

  const handleClearIdentity = () => {
    clearStoredPublicKey();
    setHasPubkey(false);
    setMyPubkey(null);
    queryClient.invalidateQueries({ queryKey: ['orgs-by-member'] });
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
          View and manage organizations. Import your public key to see your
          memberships. All write operations use the CLI with your local key
          file.
        </p>
        <div className='rounded-lg border border-brand-900/60 bg-brand-950/30 px-4 py-3 flex gap-3'>
          <Info className='w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5' />
          <p className='text-[13px] text-neutral-300'>
            Private keys are <strong>never stored in the browser</strong>.
            Generate your keypair locally with{' '}
            <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
              mero-sign generate-key --output org-key.json
            </code>
            , then import only your <strong>public key</strong> below. All org
            management is done via the CLI.
          </p>
        </div>
      </div>

      {/* No identity yet */}
      {hasPubkey === false && (
        <div className='rounded-xl border border-amber-900/60 bg-amber-950/20 p-6'>
          <div className='flex items-center gap-2 mb-3'>
            <Key className='w-4 h-4 text-amber-500' />
            <h2 className='text-[14px] font-medium text-neutral-200'>
              Set up org identity
            </h2>
          </div>
          <p className='text-neutral-400 text-sm mb-4'>
            Generate a keypair locally with{' '}
            <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300 text-[12px]'>
              mero-sign
            </code>
            , then paste the{' '}
            <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300 text-[12px]'>
              public_key
            </code>{' '}
            value here to view your organizations.
          </p>
          <div className='rounded-lg bg-neutral-900/60 border border-neutral-800 px-4 py-3 mb-4'>
            <code className='text-[12px] text-neutral-400 font-mono'>
              mero-sign generate-key --output org-key.json
            </code>
          </div>
          <button
            type='button'
            onClick={() => setShowImport(v => !v)}
            className='rounded-lg border border-neutral-700 hover:border-neutral-600 text-neutral-300 px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5'
          >
            <Upload className='w-3.5 h-3.5' />
            Import public key
          </button>
          {showImport && (
            <div className='mt-4 space-y-2'>
              <p className='text-[12px] text-neutral-500'>
                Paste the{' '}
                <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
                  public_key
                </code>{' '}
                value from your{' '}
                <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
                  org-key.json
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

      {/* Identity set */}
      {hasPubkey === true && myPubkey && (
        <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4'>
          <div className='flex items-center justify-between mb-2'>
            <div className='flex items-center gap-2'>
              <Key className='w-3.5 h-3.5 text-brand-600' />
              <span className='text-[13px] font-medium text-neutral-300'>
                Your org identity
              </span>
            </div>
            <button
              type='button'
              onClick={handleClearIdentity}
              className='text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
            >
              Clear
            </button>
          </div>
          <p
            className='text-[11px] text-neutral-500 font-mono truncate mb-2'
            title={myPubkey}
          >
            pubkey: {myPubkey}
          </p>
          <p className='text-[12px] text-neutral-500'>
            Viewing your organizations. Use the CLI with your{' '}
            <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-400 text-[11px]'>
              org-key.json
            </code>{' '}
            to create orgs and manage members and packages.
          </p>
        </div>
      )}

      {/* Create org via CLI hint */}
      <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <Terminal className='w-4 h-4 text-neutral-400' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Create an organization
          </h2>
        </div>
        <p className='text-[13px] text-neutral-400 mb-3'>
          Org creation and management happens via the CLI using your local key
          file. Private keys never leave your machine.
        </p>
        <div className='rounded-lg bg-neutral-900/60 border border-neutral-800 px-4 py-3 space-y-1'>
          <code className='block text-[12px] text-neutral-400 font-mono'>
            # One-time: generate your org key
          </code>
          <code className='block text-[12px] text-neutral-200 font-mono'>
            mero-sign generate-key --output org-key.json
          </code>
          <code className='block text-[12px] text-neutral-400 font-mono mt-2'>
            # Create an organization
          </code>
          <code className='block text-[12px] text-neutral-200 font-mono'>
            calimero-registry org -k org-key.json create -n &quot;My Org&quot;
            -s my-org
          </code>
        </div>
      </div>

      {/* Org list */}
      <div>
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          Organizations
        </h2>
        {!myPubkey ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Building2 className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              Import your public key above to see your organizations.
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
