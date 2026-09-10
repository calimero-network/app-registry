import { useCallback, useEffect, useState } from 'react';

/**
 * Light / dark toggle.
 *
 * Deliberately the same shape as `apps/mero-sheets/app/src/theme.ts`: a
 * `data-theme` attribute on `<html>`, CSS custom properties that flip under
 * it, and the choice persisted in localStorage. Two Calimero products with
 * two different theme mechanisms is how palettes drift apart.
 *
 * The palette itself lives in index.css. The important part there is that the
 * neutral scale is INVERTED rather than lightened — `text-neutral-100` means
 * "most prominent text" throughout this app, so in light mode it has to be
 * the darkest ink — and that the accent used as TEXT becomes a deep green,
 * because #a5ff11 on white is about 1.4:1 and unreadable.
 */

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'registry:theme';

export function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    // No stored choice: follow the OS rather than assuming. Someone on a
    // light desktop should not be handed a dark page they never asked for.
    return window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Set the attribute on `<html>` so the vars resolve.
 *
 * Exported and called from main.tsx BEFORE render: applying it in an effect
 * paints one dark frame first, which reads as a flash on every load for a
 * light-mode user.
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = mode;
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private browsing — the toggle still works for this session */
    }
  }, [theme]);

  const toggle = useCallback(
    () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
    []
  );

  const dark = theme === 'dark';

  return (
    <button
      type='button'
      onClick={toggle}
      data-testid='theme-toggle'
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
      className='flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-neutral-400 transition-colors duration-150 hover:bg-ink/[0.04] hover:text-neutral-200'
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}

/** Shown in dark mode: the thing you would switch TO. */
function SunIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      className='h-4 w-4 flex-shrink-0'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.6}
      strokeLinecap='round'
      aria-hidden='true'
    >
      <circle cx='12' cy='12' r='4.2' />
      <path d='M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6' />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      className='h-4 w-4 flex-shrink-0'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.6}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M20.2 14.2A8.4 8.4 0 1 1 9.8 3.8a6.6 6.6 0 0 0 10.4 10.4Z' />
    </svg>
  );
}
