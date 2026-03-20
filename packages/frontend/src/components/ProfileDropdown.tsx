import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Building2, LogOut, BadgeCheck, ShieldCheck } from 'lucide-react';
import type { AuthUser } from '@/contexts/AuthContext';

interface ProfileDropdownProps {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** When true, render as a compact block for mobile nav (no dropdown, just links). */
  compact?: boolean;
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
      <div className='ml-2 h-8 w-24 animate-pulse rounded-md bg-neutral-800/60' />
    );
  }

  if (!user) {
    return (
      <Link
        to='/login'
        className={`nav-link nav-link-inactive ml-2`}
        onClick={onNavigate}
      >
        Sign in
      </Link>
    );
  }

  const displayName = user.username
    ? `@${user.username}`
    : (user.name ?? user.email ?? 'Signed in');
  const initials = getInitials(user.name, user.email);
  const initialsAvatar = (
    <div className='flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/80 ring-1 ring-brand-500/60 select-none'>
      <span className='text-[11px] font-semibold text-white leading-none'>
        {initials}
      </span>
    </div>
  );
  const avatar =
    user.picture && !imgError ? (
      <img
        src={user.picture}
        alt=''
        className='h-7 w-7 rounded-full object-cover ring-1 ring-neutral-700'
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
          className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
        >
          <Box className='h-3.5 w-3.5 mr-2.5' />
          My packages
        </Link>
        <Link
          to='/orgs'
          onClick={onNavigate}
          className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
        >
          <Building2 className='h-3.5 w-3.5 mr-2.5' />
          Organizations
        </Link>
        {user.isAdmin && (
          <Link
            to='/admin'
            onClick={onNavigate}
            className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-brand-500 hover:bg-brand-600/10 hover:text-brand-400'
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
          className='flex w-full items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 text-left'
        >
          <LogOut className='h-3.5 w-3.5 mr-2.5' />
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className='relative ml-2' ref={ref}>
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='flex items-center gap-1.5 rounded-lg border border-transparent p-1.5 hover:border-neutral-700 hover:bg-neutral-800/60 transition-all'
        aria-expanded={open}
        aria-haspopup='true'
        aria-label={displayName}
      >
        {avatar}
        <svg
          className={`h-3 w-3 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
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
          className='absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl animate-fade-in'
          role='menu'
        >
          <div className='border-b border-neutral-700/80 px-3 py-2'>
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
            className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
            role='menuitem'
          >
            <Box className='h-3.5 w-3.5' />
            My packages
          </Link>
          <Link
            to='/orgs'
            onClick={() => setOpen(false)}
            className='flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
            role='menuitem'
          >
            <Building2 className='h-3.5 w-3.5' />
            Organizations
          </Link>
          {user.isAdmin && (
            <Link
              to='/admin'
              onClick={() => setOpen(false)}
              className='flex items-center gap-2 px-3 py-2 text-[13px] text-brand-500 hover:bg-brand-600/10 hover:text-brand-400'
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
            className='flex w-full items-center gap-2 px-3 py-2 text-[13px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
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
