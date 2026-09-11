import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/Toast';

const ERROR_MESSAGES: Record<string, string> = {
  auth_not_configured:
    'Sign-in is not configured (missing Google credentials).',
  invalid_state: 'Invalid OAuth state. Please try again.',
  missing_code: 'No authorization code received. Please try again.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  account_suspended:
    'This account has been suspended and cannot sign in to the registry.',
  session_expired: 'Your session expired. Please sign in again.',
};

/**
 * `/login` is no longer a page you look at — it is a bounce.
 *
 * The Sign in button now goes straight to `/api/auth/google`, so nobody
 * reaches this by clicking. But the route CANNOT be deleted: two things
 * navigate here on their own, and neither is a button press.
 *
 *   - `lib/api.ts` sends an expiring session to
 *     `/login?error=session_expired&from=…`
 *   - `ProtectedRoute` sends a signed-out visitor from /upload, /my-packages,
 *     /orgs and /admin to `/login?from=…`
 *
 * Delete the route and both land on the 404 page. So this keeps working:
 * it turns `?error` into a toast and forwards to the provider.
 *
 * `?from=` is read and deliberately NOT used. Returning the user to where
 * they were requires round-tripping it through the OAuth `state` parameter,
 * which is server-side; carrying it here would only look like it worked.
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useToast();
  const errorCode = searchParams.get('error');
  const bounced = useRef(false);

  useEffect(() => {
    if (bounced.current) return;
    bounced.current = true;

    if (errorCode) {
      notify(ERROR_MESSAGES[errorCode] ?? 'Sign-in failed.', 'error');
      // Stay put on an error. Bouncing straight back to Google would loop
      // through whatever just failed and the toast would never be read.
      return;
    }
    window.location.assign('/api/auth/google');
  }, [errorCode, notify]);

  return (
    <div className='py-20 text-center' data-testid='login-bounce'>
      <p className='text-[13px] text-neutral-400'>
        {errorCode ? 'Sign-in failed.' : 'Redirecting to Google…'}
      </p>
      <a
        href='/api/auth/google'
        className='mt-3 inline-block text-[13px] text-brand-600 transition-colors hover:text-brand-500'
      >
        {errorCode ? 'Try again' : 'Continue'}
      </a>
    </div>
  );
}
