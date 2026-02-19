import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen,
  ExternalLink,
  Terminal,
  FileCode,
  Shield,
  Upload,
  Package,
  ArrowRight,
} from 'lucide-react';
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
    <div className='space-y-8'>
      {/* Header */}
      <div>
        <h1 className='text-xl font-semibold text-neutral-100'>
          Publish to the Registry
        </h1>
        <p className='mt-1 text-[13px] text-neutral-500 font-light'>
          Build, bundle, and publish your application step by step.
        </p>
        <p className='mt-2 text-[12px] text-neutral-400 font-light'>
          Upload your application here or from{' '}
          <Link
            to='/my-packages'
            className='text-brand-600 hover:text-brand-500 transition-colors'
          >
            My packages
          </Link>
          , where you can start an upload and see your authored packages.
        </p>
      </div>

      {/* Upload & Publish */}
      <section className='card p-5'>
        <div className='flex items-center gap-2.5 mb-4'>
          <span className='flex-shrink-0 w-6 h-6 rounded-full bg-brand-600/10 text-brand-600 text-[11px] font-medium flex items-center justify-center'>
            •
          </span>
          <Upload className='w-4 h-4 text-neutral-500' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Publish new package
          </h2>
        </div>
        <p className='text-[13px] text-neutral-400 font-light mb-4'>
          Select a signed <code className='text-brand-600'>.mpk</code> bundle to
          publish to the registry. Your session (if logged in) will be used as
          the package author.
        </p>
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
              Login first
            </Link>{' '}
            to upload an application through the application.
          </p>
        )}
      </section>

      {/* Step 0 */}
      <Section step={0} icon={BookOpen} title='Understand Calimero apps'>
        <p className='text-[13px] text-neutral-400 font-light leading-relaxed mb-4'>
          Before publishing, read the official documentation to understand how
          self-sovereign applications work on the Calimero runtime.
        </p>
        <div className='flex flex-wrap gap-2'>
          <DocLink
            href='https://docs.calimero.network/builder-directory/sdk-guide/'
            label='Rust SDK'
          />
          <DocLink
            href='https://docs.calimero.network/builder-directory/js-sdk-guide/'
            label='JavaScript SDK'
          />
          <DocLink
            href='https://docs.calimero.network/getting-started/'
            label='Getting Started'
          />
        </div>
        <p className='text-[12px] text-neutral-500 font-light mt-3'>
          Applications can be written in{' '}
          <strong className='text-neutral-300 font-normal'>Rust</strong> or{' '}
          <strong className='text-neutral-300 font-normal'>TypeScript</strong>.
          Both compile to WASM.
        </p>
      </Section>

      {/* Step 1 */}
      <Section step={1} icon={FileCode} title='Write your application'>
        <p className='text-[13px] text-neutral-400 font-light leading-relaxed mb-4'>
          Start with the{' '}
          <InlineLink href='https://github.com/calimero-network/core/tree/master/apps/kv-store'>
            KV-Store example
          </InlineLink>{' '}
          for the full project structure including build scripts.
        </p>

        <div className='space-y-3'>
          <ScriptBlock title='build.rs'>
            Generates <code className='text-brand-600'>res/abi.json</code> and{' '}
            <code className='text-brand-600'>res/state-schema.json</code> at
            compile time by parsing your source code.
          </ScriptBlock>

          <ScriptBlock title='build.sh'>
            Compiles to WASM, copies to{' '}
            <code className='text-brand-600'>res/</code>, runs{' '}
            <code className='text-brand-600'>wasm-opt -Oz</code>.
            <Pre>{`./build.sh
# Output: res/your_app.wasm + res/abi.json`}</Pre>
          </ScriptBlock>

          <ScriptBlock title='build-bundle.sh'>
            Runs build, creates{' '}
            <code className='text-brand-600'>bundle-temp/</code> with manifest +
            artifacts, packages into{' '}
            <code className='text-brand-600'>.mpk</code>.
            <Pre>{`./build-bundle.sh
# Output: res/your-app-1.0.0.mpk`}</Pre>
          </ScriptBlock>
        </div>

        <div className='mt-3'>
          <DocLink
            href='https://github.com/calimero-network/core/tree/master/apps/kv-store'
            label='KV-Store Example'
          />
        </div>
      </Section>

      {/* Step 2 */}
      <Section step={2} icon={Shield} title='Sign with mero-sign'>
        <p className='text-[13px] text-neutral-400 font-light leading-relaxed mb-4'>
          <InlineLink href='https://github.com/calimero-network/core/tree/master/tools/mero-sign'>
            mero-sign
          </InlineLink>{' '}
          signs your manifest with Ed25519 and packages the bundle into an{' '}
          <code className='text-brand-600'>.mpk</code> file.
        </p>

        <Pre>{`# Install
cargo install --path tools/mero-sign

# Generate signing key (one-time)
mero-sign generate-key --output my-key.json

# Sign and create bundle
mero-sign sign res/bundle-temp/manifest.json \\
  --key my-key.json`}</Pre>

        <div className='mt-3 px-3 py-2 bg-yellow-500/5 border border-yellow-500/10 rounded-md'>
          <p className='text-[12px] text-yellow-200/70 font-light'>
            Keep your signing key private. Never commit it to version control.
          </p>
        </div>
      </Section>

      {/* Step 3 */}
      <Section step={3} icon={Package} title='Create bundle with CLI'>
        <p className='text-[13px] text-neutral-400 font-light leading-relaxed mb-4'>
          Alternatively, use{' '}
          <code className='text-brand-600'>calimero-registry</code> to create
          the bundle in a single command.
        </p>

        <Pre>{`calimero-registry bundle create \\
  --output application-1.0.0.mpk \\
  --name "Application Name" \\
  --description "Application Description" \\
  --author "Application Author" \\
  --frontend "https://application-frontend.com" \\
  --github "https://github.com/application/application" \\
  --docs "https://github.com/application/application" \\
  path/to/application.wasm \\
  com.application.application \\
  1.0.0`}</Pre>

        <div className='mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]'>
          {[
            ['--output', 'Output .mpk filename'],
            ['--name', 'Human-readable app name'],
            ['--description', 'Short description'],
            ['--author', 'Publisher name'],
            ['--frontend', 'Frontend URL (optional)'],
            ['--github', 'GitHub repo (optional)'],
            ['--docs', 'Docs URL (optional)'],
            ['path/to/application.wasm', 'Compiled WASM binary'],
            ['com.application.application', 'Reverse-domain package ID'],
            ['1.0.1', 'Semantic version'],
          ].map(([flag, desc]) => (
            <div key={flag} className='contents'>
              <span className='text-neutral-300 font-mono'>{flag}</span>
              <span className='text-neutral-500 font-light'>{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Step 4 */}
      <Section step={4} icon={Upload} title='Publish to remote registry'>
        <p className='text-[13px] text-neutral-400 font-light leading-relaxed mb-4'>
          Push the <code className='text-brand-600'>.mpk</code> to the remote
          registry.
        </p>

        <Pre>{`# Configure registry (one-time)
calimero-registry config set registry-url https://apps.calimero.network
# Optional
calimero-registry config set api-key <your-api-key>

# Push
calimero-registry bundle push --remote application-1.0.0.mpk`}</Pre>

        <p className='text-[12px] text-neutral-500 font-light mt-3'>
          Once pushed, your app appears on the{' '}
          <InlineLink href='/apps'>Apps</InlineLink> page.
        </p>
      </Section>

      {/* Quick reference */}
      <div className='card p-5'>
        <p className='section-heading mb-4'>Quick Reference</p>
        <div className='space-y-2.5'>
          {[
            ['Write your app', 'Rust or TypeScript, compile to WASM'],
            ['Build & generate ABI', './build.sh or pnpm build'],
            [
              'Bundle into .mpk',
              './build-bundle.sh or calimero-registry bundle create',
            ],
            ['Sign the bundle', 'mero-sign sign manifest.json --key key.json'],
            ['Publish', 'calimero-registry bundle push --remote app.mpk'],
          ].map(([title, desc], i) => (
            <div key={i} className='flex items-start gap-3'>
              <span className='flex-shrink-0 w-5 h-5 rounded-full bg-brand-600/10 text-brand-600 text-[11px] font-medium flex items-center justify-center mt-0.5'>
                {i + 1}
              </span>
              <div>
                <p className='text-[13px] text-neutral-200 font-normal'>
                  {title}
                </p>
                <p className='text-[11px] text-neutral-500 font-light'>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className='flex flex-wrap gap-2 pb-2'>
        <DocLink href='https://docs.calimero.network' label='Calimero Docs' />
        <DocLink
          href='https://github.com/calimero-network/core'
          label='Calimero Core'
        />
        <DocLink
          href='https://github.com/calimero-network/core/tree/master/tools/mero-sign'
          label='mero-sign'
        />
        <DocLink
          href='https://github.com/calimero-network/core/tree/master/apps/kv-store'
          label='KV-Store Example'
        />
      </div>
    </div>
  );
}

/* ---- Helpers ---- */

function Section({
  step,
  icon: Icon,
  title,
  children,
}: {
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className='card p-5'>
      <div className='flex items-center gap-2.5 mb-4'>
        <span className='flex-shrink-0 w-6 h-6 rounded-full bg-brand-600/10 text-brand-600 text-[11px] font-medium flex items-center justify-center'>
          {step}
        </span>
        <Icon className='w-4 h-4 text-neutral-500' />
        <h2 className='text-[14px] font-medium text-neutral-200'>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className='bg-neutral-950 border border-neutral-800 rounded-md p-3.5 text-[12px] text-neutral-300 font-mono overflow-x-auto leading-relaxed'>
      {children}
    </pre>
  );
}

function ScriptBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='bg-neutral-900/40 border border-neutral-800/60 rounded-md p-3.5'>
      <div className='flex items-center gap-2 mb-2'>
        <Terminal className='w-3 h-3 text-brand-600' />
        <span className='text-[12px] font-medium text-neutral-300'>
          {title}
        </span>
      </div>
      <div className='text-[12px] text-neutral-500 font-light leading-relaxed'>
        {children}
      </div>
    </div>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 hover:bg-neutral-800 px-2.5 py-1.5 rounded-md transition-all'
    >
      <ExternalLink className='w-3 h-3' />
      {label}
      <ArrowRight className='w-2.5 h-2.5' />
    </a>
  );
}

function InlineLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className='text-brand-600 hover:text-brand-500 transition-colors'
    >
      {children}
    </a>
  );
}
