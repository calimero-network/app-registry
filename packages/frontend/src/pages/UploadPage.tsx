import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ExternalLink, Upload, BookOpen } from 'lucide-react';
import { pushBundleFile } from '@/lib/api';

export default function UploadPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    package: string;
    version: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePublish = async () => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      const result = await pushBundleFile(file);
      setSuccess(result);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : (err as Error)?.message;
      setError(msg ?? 'Publish failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-xl font-semibold text-neutral-100'>
          Publish to the Registry
        </h1>
        <p className='mt-1 text-[13px] text-neutral-500 font-light'>
          Upload a signed <code className='text-brand-600'>.mpk</code> bundle,
          or push directly via the CLI.{' '}
          <Link
            to='/docs'
            className='text-brand-600 hover:text-brand-500 transition-colors'
          >
            Full guide in Docs →
          </Link>
        </p>
      </div>

      {/* Upload */}
      <section className='card p-5'>
        <div className='flex items-center gap-2 mb-4'>
          <Upload className='w-4 h-4 text-neutral-500' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Upload .mpk
          </h2>
        </div>
        {user ? (
          <>
            <div className='flex flex-wrap items-center gap-3'>
              <input
                ref={inputRef}
                type='file'
                accept='.mpk'
                className='text-[13px] text-neutral-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-brand-600 file:text-neutral-950 file:font-medium file:cursor-pointer cursor-pointer'
                onChange={e => {
                  const f = e.target.files?.[0];
                  setFile(f ?? null);
                  setError(null);
                  setSuccess(null);
                }}
              />
              <button
                type='button'
                disabled={!file || uploading}
                onClick={handlePublish}
                className='px-4 py-2 rounded-md bg-brand-600 text-neutral-950 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-500 transition-colors'
              >
                {uploading ? 'Publishing…' : 'Publish'}
              </button>
            </div>
            {error && (
              <p className='mt-3 text-[13px] text-red-400 font-light'>
                {error}
              </p>
            )}
            {success && (
              <p className='mt-3 text-[13px] text-green-400 font-light'>
                Published <strong>{success.package}</strong>@{success.version}.{' '}
                <Link
                  to='/apps'
                  className='text-brand-600 hover:text-brand-500'
                >
                  View apps
                </Link>
                {' · '}
                <Link
                  to='/my-packages'
                  className='text-brand-600 hover:text-brand-500'
                >
                  My packages
                </Link>
              </p>
            )}
          </>
        ) : (
          <p className='text-[13px] text-neutral-500 font-light'>
            <Link
              to={`/login?from=${encodeURIComponent(location.pathname)}`}
              className='text-brand-600 hover:text-brand-500 transition-colors'
            >
              Sign in
            </Link>{' '}
            to upload a bundle.
          </p>
        )}
      </section>

      {/* Quick Reference */}
      <section className='card p-5'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-2'>
            <BookOpen className='w-4 h-4 text-neutral-500' />
            <h2 className='text-[14px] font-medium text-neutral-200'>
              Quick reference
            </h2>
          </div>
          <Link
            to='/docs'
            className='text-[12px] text-brand-600 hover:text-brand-500 transition-colors'
          >
            Full docs →
          </Link>
        </div>

        <ol className='space-y-3'>
          {[
            {
              label: 'Write your app',
              detail: 'Rust or TypeScript',
            },
            {
              label: 'Build',
              detail: './build.sh  →  app.wasm + abi.json',
            },
            {
              label: 'Create manifest',
              detail:
                'calimero-registry bundle create app.wasm com.example.app 1.0.0',
            },
            {
              label: 'Sign manifest',
              detail: 'mero-sign sign manifest.json --key key.json',
            },
            {
              label: 'Pack into .mpk',
              detail:
                'done automatically by bundle push, or via build-bundle.sh',
            },
            {
              label: 'Publish',
              detail:
                'calimero-registry bundle push ./dist/myapp --remote  — or upload above',
            },
          ].map(({ label, detail }, i) => (
            <li key={i} className='flex items-start gap-3'>
              <span className='flex-shrink-0 w-5 h-5 rounded-full bg-brand-600/10 text-brand-600 text-[11px] font-medium flex items-center justify-center mt-0.5'>
                {i + 1}
              </span>
              <div>
                <p className='text-[13px] text-neutral-200 font-medium leading-tight'>
                  {label}
                </p>
                <p className='text-[11px] text-neutral-500 font-mono mt-0.5'>
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Links */}
      <div className='flex flex-wrap gap-2 pb-2'>
        {[
          ['https://docs.calimero.network', 'Calimero Docs'],
          [
            'https://github.com/calimero-network/core/tree/master/tools/mero-sign',
            'mero-sign',
          ],
          [
            'https://github.com/calimero-network/core/tree/master/apps/kv-store',
            'KV-Store Example',
          ],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 hover:bg-neutral-800 px-2.5 py-1.5 rounded-md transition-all'
          >
            <ExternalLink className='w-3 h-3' />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
