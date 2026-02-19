import { useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  auth_not_configured:
    'Sign-in is not configured (missing Google credentials).',
  invalid_state: 'Invalid OAuth state. Please try again.',
  missing_code: 'No authorization code received. Please try again.',
  oauth_failed: 'Google sign-in failed. Please try again.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get('error');
  const message = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? 'Something went wrong.')
    : null;

  return (
    <div className='max-w-md mx-auto text-center'>
      <div className='flex justify-center mb-6'>
        <div className='rounded-2xl bg-neutral-800/60 p-4'>
          <Package className='h-10 w-10 text-brand-500' />
        </div>
      </div>
      <h1 className='text-xl font-semibold text-neutral-100 mb-2'>
        Sign in to Calimero Registry
      </h1>
      <p className='text-neutral-400 text-sm mb-8'>
        Use your Google account to access your packages and upload apps.
      </p>

      {message && (
        <div
          className='mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm'
          role='alert'
        >
          {message}
        </div>
      )}

      <a
        href='/api/auth/google'
        className='inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors border border-neutral-700'
      >
        <svg className='h-5 w-5' viewBox='0 0 24 24'>
          <path
            fill='currentColor'
            d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
          />
          <path
            fill='currentColor'
            d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
          />
          <path
            fill='currentColor'
            d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
          />
          <path
            fill='currentColor'
            d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
          />
        </svg>
        Sign in with Google
      </a>
    </div>
  );
}
