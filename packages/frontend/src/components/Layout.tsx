import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScrollToTop } from './ScrollToTop';
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

/**
 * Kept in step with `drawer-out` in tailwind.config.js. The element has to
 * stay mounted for the slide back out, and it is a TIMER rather than an
 * `animationend` listener on purpose: under `prefers-reduced-motion` the
 * global reduce block cuts every animation to 0.01ms, and a drawer that waits
 * for an event that a cancelled animation may never fire is a drawer stuck
 * over the page.
 */
const DRAWER_EXIT_MS = 200;

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
  // ⚠️ THREE STATES, NOT A BOOLEAN. A boolean can only mount and unmount, and
  // an unmount cannot be animated: the drawer appeared and vanished at full
  // size, which is the "flip from 0 to 1" this replaces. `closing` keeps it in
  // the tree long enough to slide back out, and the spec that asserts the
  // drawer is GONE once closed still holds, because `closed` unmounts it.
  const [drawer, setDrawer] = useState<'closed' | 'open' | 'closing'>('closed');
  const mobileOpen = drawer === 'open';
  const { user, loading, logout } = useAuth();

  const closeDrawer = useCallback(
    () => setDrawer(d => (d === 'open' ? 'closing' : d)),
    []
  );

  useEffect(() => {
    if (drawer !== 'closing') return;
    const id = window.setTimeout(() => setDrawer('closed'), DRAWER_EXIT_MS);
    // Re-opening mid-exit cancels the unmount, so a fast double tap does not
    // drop the drawer out from under itself.
    return () => window.clearTimeout(id);
  }, [drawer]);

  // The page behind a drawer must not scroll with it: on a phone the drag
  // otherwise carries through to the content and you close the menu having
  // lost your place.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  // A route change must close the drawer, or navigating from inside it leaves
  // the overlay covering the page you just asked for.
  useEffect(() => {
    closeDrawer();
  }, [location.pathname, closeDrawer]);

  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href));

  /**
   * ⚠️ THE DRAWER'S LOCKUP IS THE BAR'S LOCKUP, AT THE BAR'S SIZE AND
   * POSITION. The drawer reuses the desktop rail, so opening the menu swapped
   * the 18px compact mark in the header for the rail's 22px one — the logo
   * grew as it slid in, over the header it was covering. `compact` also pulls
   * the indent back (12px of rail padding + 4px on the link = the header's
   * `px-4`) so the two marks sit on the same left edge and the same baseline.
   */
  const renderRail = (brand: 'full' | 'compact') => (
    <div
      className={`flex h-full flex-col gap-5 px-3 pb-5 ${
        brand === 'compact' ? 'pt-4' : 'pt-5'
      }`}
    >
      <Link
        to='/'
        className={brand === 'compact' ? 'px-1' : 'px-2'}
        aria-label='Calimero App Registry — home'
        data-testid='rail-brand'
      >
        <RegistryMark variant={brand} />
      </Link>

      <GlobalSearch onNavigate={closeDrawer} />

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
                  ? 'bg-ink/[0.07] text-neutral-100'
                  : 'text-neutral-400 hover:bg-ink/[0.04] hover:text-neutral-200'
              }`}
            >
              <item.icon className='h-4 w-4 flex-shrink-0' aria-hidden='true' />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className='mt-auto flex flex-col gap-0.5'>
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
      <ScrollToTop />

      {/* ── Rail (md and up) ── */}
      <aside
        data-testid='sidebar'
        className='fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-[var(--app-rail)] md:block'
        style={{ width: RAIL_WIDTH }}
      >
        {renderRail('full')}
      </aside>

      {/* ── Mobile bar + drawer ── */}
      {/* ⚠️ z-50, ABOVE THE SCRIM. At z-40 it tied with the scrim and lost on
          DOM order, so while the drawer was open the bar's own X — which stays
          visible, and changes to a close icon — sat UNDER the overlay and
          absorbed nothing: every press landed on the scrim. The drawer is also
          z-50 and comes later, so it still covers the bar's left half as it
          slides across. */}
      <header className='sticky top-0 z-50 flex h-14 items-center justify-between border-b border-line bg-[var(--app-rail)]/95 px-4 backdrop-blur-xl md:hidden'>
        <Link to='/' aria-label='Calimero App Registry — home'>
          <RegistryMark variant='compact' />
        </Link>
        <button
          onClick={() => setDrawer(d => (d === 'open' ? 'closing' : 'open'))}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          className='rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-ink/[0.06] hover:text-neutral-200'
        >
          {mobileOpen ? (
            <X className='h-5 w-5' />
          ) : (
            <Menu className='h-5 w-5' />
          )}
        </button>
      </header>

      {drawer !== 'closed' && (
        <>
          <button
            aria-label='Close menu'
            tabIndex={-1}
            onClick={closeDrawer}
            className={`fixed inset-0 z-40 bg-black/60 md:hidden ${
              drawer === 'closing'
                ? 'pointer-events-none animate-scrim-out'
                : 'animate-scrim-in'
            }`}
          />
          <aside
            data-testid='sidebar-drawer'
            aria-hidden={drawer === 'closing'}
            // `will-change` because the panel carries the search field and the
            // whole nav: promoting it once keeps the slide on the compositor
            // instead of repainting that subtree every frame.
            className={`fixed inset-y-0 left-0 z-50 border-r border-line bg-[var(--app-rail)] shadow-[0_0_40px_rgba(0,0,0,0.35)] will-change-transform md:hidden ${
              drawer === 'closing' ? 'animate-drawer-out' : 'animate-drawer-in'
            }`}
            style={{ width: RAIL_WIDTH }}
          >
            {renderRail('compact')}
          </aside>
        </>
      )}

      {/* ── Content ── */}
      <div className='md:pl-[232px]'>
        <main className='mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8'>
          {children}
        </main>

        <footer className='mt-16 border-t border-line'>
          <div className='mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8'>
            <div className='flex flex-col items-start gap-3'>
              <img
                src={calimeroLogo}
                alt='Calimero'
                className='h-5 opacity-70'
                style={{ filter: 'var(--logo-filter)' }}
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
