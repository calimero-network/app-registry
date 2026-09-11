import { useCallback, useEffect, useState } from 'react';

/**
 * Light / dark toggle — an icon, and it lives on the HOME page only.
 *
 * It used to sit in the rail on every page. A theme is set once and then left
 * alone, so a permanent control in the primary navigation gave a one-time
 * decision the same weight as Explore and Docs. The choice still persists
 * across the whole site; only the switch moved.
 *
 * Deliberately the same shape as `apps/mero-sheets/app/src/theme.ts`: a
 * `data-theme` attribute on `<html>`, CSS custom properties that flip under
 * it, and the choice persisted in localStorage. Two Calimero products with
 * two different theme mechanisms is how palettes drift apart.
 *
 * ⚠️ LIGHT IS THE DEFAULT, AND `prefers-color-scheme` IS NOT CONSULTED.
 * It used to follow the OS, which means a visitor on a dark desktop never saw
 * the light design however it was described as the default — in practice
 * `prefers-color-scheme` resolves to light or dark for everyone, so honouring
 * it and having a default are the same decision made twice. A stored choice
 * still wins over everything; the toggle is the way to dark.
 *
 * The palette itself lives in index.css. The important part there is that the
 * neutral scale is INVERTED rather than lightened — `text-neutral-100` means
 * "most prominent text" throughout this app, so in light mode it has to be
 * the darkest ink — and that the accent used as TEXT becomes a deep green,
 * because #a5ff11 on white is about 1.4:1 and unreadable.
 */

export type ThemeMode = 'light' | 'dark';

/**
 * ⚠️ A NEW KEY, AND THE OLD ONE IS DISCARDED ON SIGHT.
 *
 * `registry:theme` was written on every mount, not on every press — so the
 * theme the old build resolved from the OS was persisted as though the
 * visitor had chosen it. Anyone who has ever opened the registry on a dark
 * desktop has `dark` sitting in that key, a stored choice beats the default,
 * and the light default would therefore have reached nobody but a brand-new
 * browser. The two cases are indistinguishable inside that key — a real
 * press and an automatic write look identical — so the key is abandoned
 * rather than migrated. Someone who genuinely wanted dark presses the toggle
 * once more.
 */
const STORAGE_KEY = 'registry:theme:choice';
const LEGACY_KEY = 'registry:theme';

export const DEFAULT_THEME: ThemeMode = 'light';

export function getStoredTheme(): ThemeMode {
  try {
    // Best-effort, and deliberately unconditional: leaving it behind means
    // every debugging session from here on has two theme keys to reason
    // about, one of which means nothing.
    localStorage.removeItem(LEGACY_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return DEFAULT_THEME;
  } catch {
    // Private browsing: no stored choice is readable, so this is the default
    // path rather than an error path.
    return DEFAULT_THEME;
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

  // Applying only. ⚠️ PERSISTING HERE IS WHAT BROKE THE DEFAULT: this effect
  // runs on mount as well as on a change, so merely loading the page recorded
  // a choice the visitor never made. Storage is written by the press below,
  // and nowhere else.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing — the toggle still works for this session */
    }
  }, [theme]);

  const dark = theme === 'dark';

  return (
    <button
      type='button'
      onClick={toggle}
      data-testid='theme-toggle'
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
      // ⚠️ THE LABEL IS GONE FROM THE FACE OF IT, NOT FROM THE CONTROL.
      // `aria-label` and `title` still say which way it goes, because an icon
      // that toggles between a sun and a moon is ambiguous about whether it
      // shows the current state or the one it switches to.
      className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-neutral-400 transition-colors duration-150 hover:bg-ink/[0.04] hover:text-neutral-200'
    >
      {dark ? <SunIcon /> : <MoonIcon />}
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
