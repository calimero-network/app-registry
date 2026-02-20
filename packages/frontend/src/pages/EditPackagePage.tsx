import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Terminal } from 'lucide-react';
import { getBundleManifestRaw } from '@/lib/api';

export default function EditPackagePage() {
  const { appId = '', version = '' } = useParams<{
    appId: string;
    version: string;
  }>();
  const [submitted, setSubmitted] = useState(false);
  const formInitialized = useRef(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    author: '',
    frontend: '',
    github: '',
    docs: '',
  });

  const { data: manifest, isLoading, error } = useQuery({
    queryKey: ['bundle-manifest', appId, version],
    queryFn: () => getBundleManifestRaw(appId, version),
    enabled: !!appId && !!version,
  });

  useEffect(() => {
    if (!manifest || formInitialized.current) return;
    formInitialized.current = true;
    const meta = manifest.metadata ?? {};
    const links = manifest.links ?? {};
    setForm({
      name: meta.name ?? '',
      description: meta.description ?? '',
      author: meta.author ?? '',
      frontend: links.frontend ?? '',
      github: links.github ?? '',
      docs: links.docs ?? '',
    });
  }, [manifest]);

  const downloadManifest = useCallback(() => {
    if (!manifest) return;
    const updated = {
      ...manifest,
      metadata: {
        ...manifest.metadata,
        name: form.name || manifest.metadata?.name,
        description: form.description ?? manifest.metadata?.description,
        author: form.author === '' ? undefined : form.author || manifest.metadata?.author,
      },
      links: {
        ...manifest.links,
        frontend: form.frontend || undefined,
        github: form.github || undefined,
        docs: form.docs || undefined,
      },
    };
    // Remove signature so user must re-sign
    delete (updated as Record<string, unknown>).signature;
    const blob = new Blob([JSON.stringify(updated, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    a.click();
    URL.revokeObjectURL(url);
    setSubmitted(true);
  }, [manifest, form]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    downloadManifest();
  };

  if (isLoading) {
    return (
      <div className='space-y-5 animate-pulse'>
        <div className='h-4 bg-neutral-800 rounded w-20' />
        <div className='h-6 bg-neutral-800 rounded w-1/3' />
        <div className='h-32 bg-neutral-800/50 rounded-lg' />
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className='space-y-6'>
        <BackLink appId={appId} />
        <div className='text-center py-16'>
          <p className='text-[13px] text-red-400'>
            Failed to load manifest for {appId}@{version}.
          </p>
          <Link
            to={`/apps/${appId}`}
            className='mt-3 inline-block text-brand-600 hover:text-brand-500 text-sm'
          >
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <BackLink appId={appId} />
      <div>
        <h1 className='text-xl font-semibold text-neutral-100'>
          Edit package metadata
        </h1>
        <p className='text-[12px] text-neutral-500 font-mono mt-1'>
          {appId} @ v{version}
        </p>
      </div>

      <form onSubmit={handleSubmit} className='card p-5 space-y-4'>
        <p className='text-[13px] text-neutral-400 font-light'>
          Change name, description, author, or links. After saving, you will
          download <code className='text-brand-600'>manifest.json</code>. Sign it
          with mero-sign and run the CLI to publish the update.
        </p>

        <div>
          <label className='block text-[11px] text-neutral-500 mb-1.5'>
            Display name
          </label>
          <input
            type='text'
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none'
            placeholder={manifest.metadata?.name || appId}
          />
        </div>
        <div>
          <label className='block text-[11px] text-neutral-500 mb-1.5'>
            Description
          </label>
          <textarea
            value={form.description}
            onChange={e =>
              setForm(f => ({ ...f, description: e.target.value }))
            }
            rows={3}
            className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none resize-y'
            placeholder='Short description'
          />
        </div>
        <div>
          <label className='block text-[11px] text-neutral-500 mb-1.5'>
            Author (leave empty to clear)
          </label>
          <input
            type='text'
            value={form.author}
            onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none'
            placeholder='e.g. developer@example.com'
          />
        </div>
        <div>
          <label className='block text-[11px] text-neutral-500 mb-1.5'>
            Links (optional)
          </label>
          <div className='space-y-2'>
            <input
              type='url'
              value={form.frontend}
              onChange={e =>
                setForm(f => ({ ...f, frontend: e.target.value }))
              }
              className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none'
              placeholder='Frontend URL'
            />
            <input
              type='url'
              value={form.github}
              onChange={e => setForm(f => ({ ...f, github: e.target.value }))}
              className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none'
              placeholder='GitHub URL'
            />
            <input
              type='url'
              value={form.docs}
              onChange={e => setForm(f => ({ ...f, docs: e.target.value }))}
              className='w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-[13px] focus:border-brand-600 focus:outline-none'
              placeholder='Docs URL'
            />
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-3 pt-2'>
          <button
            type='submit'
            className='inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-neutral-950 font-medium text-[13px] hover:bg-brand-500 transition-colors'
          >
            <Download className='w-4 h-4' />
            Download manifest.json
          </button>
        </div>
      </form>

      {submitted && (
        <div className='card p-5 space-y-3'>
          <p className='text-[13px] font-medium text-neutral-200 flex items-center gap-2'>
            <Download className='w-4 h-4 text-green-500' />
            manifest.json downloaded
          </p>
          <p className='text-[12px] text-neutral-400 font-light'>
            Next steps:
          </p>
          <ol className='list-decimal list-inside space-y-2 text-[12px] text-neutral-300 font-mono bg-neutral-900/60 rounded-lg p-4'>
            <li>Sign the file with mero-sign:</li>
          </ol>
          <pre className='text-[11px] text-neutral-400 bg-neutral-900 rounded-md p-3 overflow-x-auto'>
            {`mero-sign sign manifest.json --key your-key.json`}
          </pre>
          <ol start={2} className='list-decimal list-inside space-y-2 text-[12px] text-neutral-300 font-mono mt-3'>
            <li>Publish the signed manifest with the CLI:</li>
          </ol>
          <pre className='text-[11px] text-neutral-400 bg-neutral-900 rounded-md p-3 overflow-x-auto flex items-center gap-2'>
            <Terminal className='w-3.5 h-3.5 flex-shrink-0 text-neutral-500' />
            {`calimero-registry bundle edit ${appId} ${version} --remote --manifest signed-manifest.json`}
          </pre>
        </div>
      )}
    </div>
  );
}

function BackLink({ appId }: { appId: string }) {
  return (
    <Link
      to={`/apps/${appId}`}
      className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
    >
      <ArrowLeft className='w-3 h-3' />
      Back to app
    </Link>
  );
}
