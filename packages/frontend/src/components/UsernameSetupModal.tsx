import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const USERNAME_REGEX = /^[a-z0-9]([a-z0-9_-]{0,48}[a-z0-9])?$/;

function validate(value: string): string | null {
  if (!value) return 'Username is required';
  if (value.length < 2) return 'Must be at least 2 characters';
  if (value.length > 50) return 'Must be 50 characters or fewer';
  if (!USERNAME_REGEX.test(value))
    return 'Only lowercase letters, numbers, underscores, and hyphens. Must start and end with a letter or number.';
  return null;
}

export function UsernameSetupModal() {
  const { claimUsername } = useAuth();
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validationError = touched ? validate(value) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validate(value);
    if (err) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await claimUsername(value.trim());
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to set username. Please try again.';
      setServerError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm'>
      <div className='w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl'>
        <h2 className='text-lg font-semibold text-neutral-100 mb-1'>
          Choose your username
        </h2>
        <p className='text-[13px] text-neutral-400 mb-5'>
          Pick a username to represent you on the registry. This cannot be
          changed later.
        </p>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-[12px] text-neutral-400 mb-1.5'>
              Username
            </label>
            <div className='relative'>
              <span className='absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-[13px] select-none'>
                @
              </span>
              <input
                type='text'
                value={value}
                onChange={e => {
                  setValue(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                  );
                  setServerError(null);
                  if (touched) setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                placeholder='yourname'
                maxLength={50}
                autoFocus
                autoComplete='off'
                spellCheck={false}
                className={`input pl-7 w-full font-mono ${
                  validationError || serverError
                    ? 'border-red-500/70 focus-visible:ring-red-500/30 focus-visible:border-red-500'
                    : ''
                }`}
              />
            </div>
            {(validationError || serverError) && (
              <p className='mt-1.5 text-[12px] text-red-400'>
                {validationError || serverError}
              </p>
            )}
            <p className='mt-1.5 text-[11px] text-neutral-600'>
              2–50 characters. Letters, numbers, underscores, hyphens. Cannot be
              changed.
            </p>
          </div>

          <button
            type='submit'
            disabled={submitting}
            className='w-full rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 px-4 py-2.5 text-[13px] font-medium transition-colors'
          >
            {submitting ? 'Saving…' : 'Set username'}
          </button>
        </form>
      </div>
    </div>
  );
}
