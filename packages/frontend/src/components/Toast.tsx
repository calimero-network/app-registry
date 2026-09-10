import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { X } from 'lucide-react';

/**
 * A minimal toast.
 *
 * It exists because sign-in stopped having a page to show errors on. A failed
 * OAuth round trip comes back as `?error=oauth_failed`; with the interstitial
 * gone, something has to render that or a failed login fails silently, which
 * is worse than the page it replaced.
 *
 * Deliberately small: no queue priorities, no positions, no animation library.
 * Anything more is a component library, and this app needs one notification
 * at a time.
 */

export type ToastKind = 'error' | 'info' | 'success';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => {} });

export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setToasts(t => [...t, { id, kind, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  // `notify` is stable, so the value only changes when it must.
  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // `aria-live` so a screen reader announces it: a toast that only
        // exists visually is invisible to exactly the users least able to
        // guess that something failed.
        aria-live='polite'
        className='pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2'
      >
        {toasts.map(t => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  // Errors stay until dismissed. An error that vanishes after four seconds is
  // an error the user did not read.
  useEffect(() => {
    if (toast.kind === 'error') return;
    const id = setTimeout(onDismiss, 4500);
    return () => clearTimeout(id);
  }, [toast.kind, onDismiss]);

  const tone =
    toast.kind === 'error'
      ? 'border-red-800/50 bg-red-950/80 text-red-200'
      : toast.kind === 'success'
        ? 'border-emerald-800/50 bg-emerald-950/80 text-emerald-200'
        : 'border-white/[0.1] bg-neutral-900/90 text-neutral-200';

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      data-testid='toast'
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[12.5px] shadow-xl backdrop-blur ${tone}`}
    >
      <span className='flex-1'>{toast.message}</span>
      <button
        onClick={onDismiss}
        aria-label='Dismiss'
        className='mt-0.5 opacity-60 transition-opacity hover:opacity-100'
      >
        <X className='h-3.5 w-3.5' />
      </button>
    </div>
  );
}
