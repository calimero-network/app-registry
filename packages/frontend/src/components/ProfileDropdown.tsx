import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Building2,
  LogIn,
  LogOut,
  BadgeCheck,
  ShieldCheck,
} from 'lucide-react';
import type { AuthUser } from '@/contexts/AuthContext';

interface ProfileDropdownProps {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** When true, render as a compact block for mobile nav (no dropdown, just links). */
  compact?: boolean;
  /**
   * Which way the menu opens. `'down'` suited a sticky header; at the foot of
   * a fixed rail there is nothing below the trigger, so `'up'` is required or
   * the menu renders off-screen.
   */
  side?: 'down' | 'up';
  onNavigate?: () => void;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export function ProfileDropdown({
  user,
  loading,
  logout,
  compact = false,
  side = 'down',
  onNavigate,
}: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (loading) {
    return (
      <div className='ml-2 h-8 w-24 animate-pulse rounded-md bg-ink/[0.06]' />
    );
  }

  if (!user) {
    // A plain <a>, not a router Link: this leaves the SPA for Google's OAuth
    // endpoint, so it must be a real navigation. There is no interstitial —
    // one click goes straight to the provider. Errors come back as
    // `?error=…` and are turned into a toast by AuthErrorToast.
    //
    // Width and shape match the nav items above it (item 2): the signed-out
    // state used `nav-link ml-2`, which was narrower than everything else in
    // the rail and hung off to one side.
    return (
      <a
        href='/api/auth/google'
        onClick={onNavigate}
        data-testid='sign-in'
        className='flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-neutral-400 transition-colors duration-150 hover:bg-ink/[0.04] hover:text-neutral-200'
      >
        <LogIn className='h-4 w-4 flex-shrink-0' aria-hidden='true' />
        Sign in
      </a>
    );
  }

  const displayName = user.username
    ? `@${user.username}`
    : (user.name ?? user.email ?? 'Signed in');
  const initials = getInitials(user.name, user.email);
  const initialsAvatar = (
    <div className='flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent ring-1 ring-brand-accent-hover select-none'>
      <span className='text-[11px] font-semibold text-black leading-none'>
        {initials}
      </span>
    </div>
  );
  const avatar =
    user.picture && !imgError ? (
      <img
        src={user.picture}
        alt=''
        className='h-7 w-7 rounded-full object-cover ring-1 ring-ink/[0.1]'
        onError={() => setImgError(true)}
      />
    ) : (
      initialsAvatar
    );

  if (compact) {
    return (
      <div className='space-y-0.5'>
        <div className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-400'>
          {avatar}
          <span className='truncate text-neutral-300'>{displayName}</span>
          {user.verified && (
            <BadgeCheck className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400' />
          )}
        </div>
        <Link
          to='/my-packages'
          onClick={onNavigate}
          className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-ink/[0.06] hover:text-neutral-200'
        >
          <Box className='h-3.5 w-3.5 mr-2.5' />
          My packages
        </Link>
        <Link
          to='/orgs'
          onClick={onNavigate}
          className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-ink/[0.06] hover:text-neutral-200'
        >
          <Building2 className='h-3.5 w-3.5 mr-2.5' />
          Organizations
        </Link>
        {/* Same fix as the menu below. ⚠️ THIS BRANCH IS UNREACHABLE: nothing
            passes `compact` any more — the mobile drawer renders the rail, so
            one component serves both widths. Corrected in place rather than
            deleted, since deleting it is a separate call. */}
        {user.isAdmin && (
          <Link
            to='/admin'
            onClick={onNavigate}
            className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-ink/[0.06] hover:text-neutral-200'
          >
            <ShieldCheck className='h-3.5 w-3.5 mr-2.5' />
            Admin
          </Link>
        )}
        <button
          type='button'
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className='flex w-full items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-ink/[0.04] hover:text-neutral-200 text-left'
        >
          <LogOut className='h-3.5 w-3.5 mr-2.5' />
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className='relative' ref={ref}>
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='flex w-full items-center gap-2 rounded-lg border border-transparent p-1.5 transition-colors duration-150 hover:border-line-strong hover:bg-ink/[0.06]'
        aria-expanded={open}
        aria-haspopup='true'
        aria-label={displayName}
      >
        {avatar}
        {/* The name, not just the picture.
            The trigger rendered the avatar and the chevron and nothing else,
            so the rail gave a signed-in person no way to see WHICH account
            they were signed in as without opening the menu — and with a
            Google picture loaded, no way to tell they were signed in at all
            rather than looking at a generic placeholder. The compact mobile
            block had shown the name all along; this brings the rail level
            with it.

            `min-w-0` is what makes `truncate` work: a flex child defaults to
            `min-width:auto`, which refuses to shrink below its content, so
            without it a long `@username` pushes the chevron out of the rail
            instead of ellipsing. */}
        <span className='min-w-0 flex-1 truncate text-left text-[13px] font-medium text-neutral-200'>
          {displayName}
        </span>
        {user.verified && (
          <BadgeCheck
            className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400'
            aria-label='Verified'
            role='img'
          />
        )}
        <svg
          className={`h-3 w-3 flex-shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </button>
      {open && (
        <div
          // ⚠️ `bg-[#0d0d0f]` — a hardcoded near-black — is what made this
          // menu the one surface in the app that never left dark mode. The
          // theme swap works by redefining custom properties, so a literal
          // hex in a class name is unreachable by it: in light mode the panel
          // stayed black while the `text-neutral-300` items inside it
          // inverted to near-black ink, which is why the open dropdown read
          // as an empty dark box. `.menu-panel` draws from the same
          // `--surface`/`--border`/`--shadow-card` tokens as `.card`.
          className={`menu-panel absolute left-0 z-50 min-w-[200px] py-1 ${
            side === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          role='menu'
        >
          <div className='border-b border-line px-3 py-2'>
            <p className='truncate text-[12px] text-neutral-400'>
              Signed in as
            </p>
            <p className='flex items-center gap-1.5 truncate text-[13px] font-medium text-neutral-200'>
              {displayName}
              {user.verified && (
                <BadgeCheck className='h-3.5 w-3.5 flex-shrink-0 text-emerald-400' />
              )}
            </p>
          </div>
          <Link
            to='/my-packages'
            onClick={() => setOpen(false)}
            className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-300 hover:bg-ink/[0.06] hover:text-neutral-100'
            role='menuitem'
          >
            <Box className='h-3.5 w-3.5' />
            My packages
          </Link>
          <Link
            to='/orgs'
            onClick={() => setOpen(false)}
            className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-300 hover:bg-ink/[0.06] hover:text-neutral-100'
            role='menuitem'
          >
            <Building2 className='h-3.5 w-3.5' />
            Organizations
          </Link>
          {/* ⚠️ THE SAME CLASSES AS THE TWO ITEMS ABOVE, DELIBERATELY.
              This row inked itself in `brand-500` over a green tint and
              brightened to `brand-400` on hover — and that step is a LITERAL
              #c9ff73 with no light-mode counterpart, because the themed
              accent stops at 600 and 500.
              So in light mode it sat at 7.58:1 and hovering took it to a pale
              lime on a pale green tint: **1.02:1**, the row vanishing under
              the cursor, while the two items above it went 13.87 → 16.53 and
              got MORE legible. Dark mode was fine (14.37 → 11.62), which is
              why it survived.

              The shield icon is what marks this as the admin row now; the
              colour was doing that job and failing at it on paper. */}
          {user.isAdmin && (
            <Link
              to='/admin'
              onClick={() => setOpen(false)}
              className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-300 hover:bg-ink/[0.06] hover:text-neutral-100'
              role='menuitem'
            >
              <ShieldCheck className='h-3.5 w-3.5' />
              Admin
            </Link>
          )}
          <button
            type='button'
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className='flex w-full items-center gap-2 px-3 py-2 text-[13px] text-neutral-400 hover:bg-ink/[0.06] hover:text-neutral-200'
            role='menuitem'
          >
            <LogOut className='h-3.5 w-3.5' />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
