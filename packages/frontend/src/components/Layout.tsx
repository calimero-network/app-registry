import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigation } from '@/constants/navigation';
import { ProfileDropdown } from './ProfileDropdown';
import { GlobalSearch } from './GlobalSearch';
import { RegistryMark } from './RegistryMark';
import calimeroLogo from '@/assets/calimero-logo.svg';

const FOOTER_LINKS = [
  {
    heading: 'Product',
    items: [
      { label: 'Calimero Network', href: 'https://calimero.network' },
      { label: 'Mero Cloud', href: 'https://cloud.calimero.network' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'Documentation', href: 'https://docs.calimero.network' },
      { label: 'GitHub', href: 'https://github.com/calimero-network' },
    ],
  },
  {
    heading: 'Resources',
    items: [
      {
        label: 'App Registry',
        href: 'https://github.com/calimero-network/app-registry',
      },
      {
        label: 'Releases',
        href: 'https://github.com/calimero-network/core/releases',
      },
    ],
  },
];

const RAIL_WIDTH = 232;

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Vertical rail + content column.
 *
 * The rail is fixed rather than sticky. `ProfileDropdown` used to sit inside a
 * sticky header and open downward into the page; at the foot of a fixed rail
 * it has nothing below it, so it opens upward (`side="up"`).
 *
 * The footer moved into the content column. Its three link groups are wider
 * than the rail, and a rail that scrolls to reach a footer defeats the point
 * of pinning the navigation.
 */
export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, logout } = useAuth();

  // A route change must close the drawer, or navigating from inside it leaves
  // the overlay covering the page you just asked for.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href));

  const rail = (
    <div className='flex h-full flex-col gap-5 px-3 py-5'>
      <Link
        to='/'
        className='px-2'
        aria-label='Calimero App Registry — home'
        data-testid='rail-brand'
      >
        <RegistryMark />
      </Link>

      <GlobalSearch onNavigate={() => setMobileOpen(false)} />

      <nav className='flex flex-col gap-0.5' aria-label='Primary'>
        {navigation.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              data-testid={`nav-${item.name.toLowerCase()}`}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 ${
                active
                  ? 'bg-white/[0.07] text-neutral-100'
                  : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
              }`}
            >
              <item.icon className='h-4 w-4 flex-shrink-0' aria-hidden='true' />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className='mt-auto'>
        <ProfileDropdown
          user={user}
          loading={loading}
          logout={logout}
          side='up'
        />
      </div>
    </div>
  );

  return (
    <div className='min-h-screen'>
      {/* ── Rail (md and up) ── */}
      <aside
        data-testid='sidebar'
        className='fixed inset-y-0 left-0 z-40 hidden border-r border-white/[0.06] bg-[#0d1117] md:block'
        style={{ width: RAIL_WIDTH }}
      >
        {rail}
      </aside>

      {/* ── Mobile bar + drawer ── */}
      <header className='sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0d1117]/95 px-4 backdrop-blur-xl md:hidden'>
        <Link to='/' aria-label='Calimero App Registry — home'>
          <RegistryMark variant='compact' />
        </Link>
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          className='rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200'
        >
          {mobileOpen ? (
            <X className='h-5 w-5' />
          ) : (
            <Menu className='h-5 w-5' />
          )}
        </button>
      </header>

      {mobileOpen && (
        <>
          <button
            aria-label='Close menu'
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
            className='fixed inset-0 z-40 bg-black/60 md:hidden'
          />
          <aside
            data-testid='sidebar-drawer'
            className='fixed inset-y-0 left-0 z-50 border-r border-white/[0.06] bg-[#0d1117] md:hidden'
            style={{ width: RAIL_WIDTH }}
          >
            {rail}
          </aside>
        </>
      )}

      {/* ── Content ── */}
      <div className='md:pl-[232px]'>
        <main className='mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8'>
          {children}
        </main>

        <footer className='mt-16 border-t border-white/[0.06]'>
          <div className='mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8'>
            <div className='flex flex-col items-start gap-3'>
              <img
                src={calimeroLogo}
                alt='Calimero'
                className='h-5 opacity-70'
                style={{ filter: 'brightness(0) invert(1)' }}
              />
              <p className='max-w-[220px] text-[12.5px] font-light leading-relaxed text-neutral-500'>
                A self-sovereign registry for verifiable applications.
              </p>
            </div>
            {FOOTER_LINKS.map(group => (
              <div key={group.heading}>
                <h2 className='mb-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500'>
                  {group.heading}
                </h2>
                <ul className='space-y-1.5'>
                  {group.items.map(item => (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        target='_blank'
                        rel='noreferrer'
                        className='text-[12.5px] font-light text-neutral-400 transition-colors hover:text-neutral-200'
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
