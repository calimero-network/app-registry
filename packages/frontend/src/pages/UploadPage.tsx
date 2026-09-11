import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Upload } from 'lucide-react';
import { pushBundleFile } from '@/lib/api';
import { PublishArt } from '@/components/PublishArt';

type UploadErrorLike = {
  response?: {
    data?: {
      error?: string;
      message?: string;
      /** metadata_incomplete lists every gap at once, so show them all. */
      problems?: string[];
      categories?: string[];
    };
  };
  message?: string;
};

export default function UploadPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [success, setSuccess] = useState<{
    package: string;
    version: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearSelectedFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const snapshotSelectedFile = async (selected: File): Promise<File> => {
    const bytes = await selected.arrayBuffer();
    return new File([bytes], selected.name, {
      type: selected.type || 'application/octet-stream',
      lastModified: selected.lastModified,
    });
  };

  const handlePublish = async () => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    setProblems([]);
    try {
      const result = await pushBundleFile(file);
      setSuccess(result);
      clearSelectedFile();
    } catch (err: unknown) {
      const uploadErr = err as UploadErrorLike;
      const code = uploadErr?.response?.data?.error;
      const responseMessage = uploadErr?.response?.data?.message;
      const fallbackMessage = uploadErr?.message;

      if (code === 'metadata_incomplete') {
        // Every problem arrives at once; listing them beats a paragraph the
        // publisher has to parse to find the four fields they must add.
        const problems = uploadErr?.response?.data?.problems ?? [];
        setProblems(problems);
        setError(
          problems.length
            ? 'This bundle is missing metadata the registry requires of a new package.'
            : (responseMessage ?? 'Metadata is incomplete.')
        );
      } else if (code === 'version_not_allowed') {
        clearSelectedFile();
        setError(
          `${responseMessage ?? 'Version is not allowed.'} Rebuild the bundle, then re-select the updated .mpk before publishing again.`
        );
      } else {
        setError(responseMessage ?? fallbackMessage ?? 'Publish failed');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className='space-y-8'>
      {/* Header */}
      <div className='animate-fade-in'>
        <h1 className='text-xl font-semibold text-neutral-100'>
          Publish to the Registry
        </h1>
        <p className='mt-1 text-[13px] text-neutral-500 font-light'>
          {/* "step by step" went with the steps: the walkthrough that used to
              sit under this form is gone, and a subtitle promising numbered
              instructions that are not on the page is the kind of small lie
              that makes people scroll looking for them. */}
          Build, bundle, and publish your application.
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
        <div className='mb-4 flex items-center gap-2.5'>
          {/* The bullet in a circle that used to sit here was the step number
              from the walkthrough, left behind when the steps were removed —
              a numbered marker for a sequence that no longer exists. */}
          <Upload className='h-4 w-4 text-neutral-500' />
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
                onChange={async e => {
                  const selected = e.target.files?.[0];
                  setError(null);
                  setSuccess(null);
                  if (!selected) {
                    setFile(null);
                    return;
                  }

                  try {
                    const snapshot = await snapshotSelectedFile(selected);
                    setFile(snapshot);
                  } catch {
                    clearSelectedFile();
                    setError(
                      'Failed to read the selected .mpk file. Please select it again.'
                    );
                  }
                }}
              />
              <button
                type='button'
                disabled={!file || uploading}
                onClick={handlePublish}
                className='btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {uploading ? 'Publishing…' : 'Publish'}
              </button>
            </div>
            {error && (
              <p className='mt-3 text-[13px] text-red-400 font-light'>
                {error}
              </p>
            )}
            {problems.length > 0 && (
              <ul className='mt-2 space-y-1 text-[12px] text-red-400/90 font-light list-disc list-inside'>
                {problems.map(problem => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
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

      {/* ⚠️ THE FIVE-STEP WALKTHROUGH THAT WAS HERE IS GONE, AND WAS NOT
          MOVED. It taught `mero-sign`, `calimero-registry bundle create` and
          `bundle push` — a flow the docs page states outright is replaced by
          `cargo mero`. So this was not a second copy of the instructions, it
          was a contradicting one, and the docs already cover every command it
          mentioned, including generating a key and keeping it out of the
          repository. Two sets of instructions where one is wrong is worse
          than one set. */}
      <PublishArt />

      <p className='text-[12.5px] font-light text-neutral-500'>
        Building a bundle for the first time?{' '}
        <Link
          to='/docs'
          className='text-brand-600 transition-colors hover:text-brand-500'
        >
          The documentation
        </Link>{' '}
        walks through <code className='text-brand-600'>cargo mero</code> from an
        empty directory to a signed bundle published here.
      </p>
    </div>
  );
}
