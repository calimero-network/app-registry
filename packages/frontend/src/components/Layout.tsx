import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScrollToTop } from './ScrollToTop';
import { useAuth } from '@/contexts/AuthContext';
import { navigation } from '@/constants/navigation';
import { ProfileDropdown } from './ProfileDropdown';
import { GlobalSearch } from './GlobalSearch';
import { RegistryMark } from './RegistryMark';
import badgeVertical from '@/assets/brand/calimeroBadgeVertical.svg';
import badgeHorizontal from '@/assets/brand/calimeroBadgeHorizontal.svg';
import menuIcon from '@/assets/brand/menu.svg?raw';
import closeIcon from '@/assets/brand/close.svg?raw';
import downloadIcon from '@/assets/brand/download.svg?raw';
import cloudIcon from '@/assets/brand/cloud.svg?raw';
import marketplaceIcon from '@/assets/brand/marketplace.svg?raw';
import documentIcon from '@/assets/brand/document.svg?raw';
import githubIcon from '@/assets/brand/github.svg?raw';
import xIcon from '@/assets/brand/x.svg?raw';
import linkedinIcon from '@/assets/brand/linkedin.svg?raw';

/**
 * The "Calimero" menu: where the registry sits in the family, in the shape of
 * calimero.network's own nav panels — an icon, a name, the one line that says
 * whether it is the link you want.
 */
const FAMILY = [
  {
    text: 'Calimero Desktop',
    desc: 'Run a node and install these apps on macOS, Windows or Linux',
    href: 'https://calimero.network/download',
    icon: downloadIcon,
  },
  {
    text: 'Calimero Cloud',
    desc: 'Keep your namespaces online, on machines we can’t look inside',
    href: 'https://cloud.calimero.network',
    icon: cloudIcon,
  },
  {
    text: 'calimero.network',
    desc: 'The open-source protocol for sovereign apps',
    href: 'https://calimero.network',
    icon: marketplaceIcon,
  },
  {
    text: 'Documentation',
    desc: 'Build an app, sign the bundle, run your own node',
    href: 'https://docs.calimero.network',
    icon: documentIcon,
  },
  {
    text: 'GitHub',
    desc: 'The node, the SDKs and this registry, in the open',
    href: 'https://github.com/calimero-network',
    icon: githubIcon,
  },
];

const FOOTER_LINKS = [
  {
    heading: 'Registry',
    items: [
      { label: 'Explore apps', to: '/explore' },
      { label: 'Developers', to: '/developers' },
      { label: 'Publish an app', to: '/upload' },
      { label: 'Registry docs', to: '/docs' },
    ],
  },
  {
    heading: 'Product',
    items: [
      { label: 'Calimero', href: 'https://calimero.network' },
      { label: 'Calimero Desktop', href: 'https://calimero.network/download' },
      { label: 'Calimero Cloud', href: 'https://cloud.calimero.network' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'Documentation', href: 'https://docs.calimero.network' },
      { label: 'GitHub', href: 'https://github.com/calimero-network' },
      {
        label: 'Registry source',
        href: 'https://github.com/calimero-network/app-registry',
      },
      {
        label: 'Releases',
        href: 'https://github.com/calimero-network/core/releases',
      },
    ],
  },
];

const SOCIAL = [
  {
    label: 'GitHub',
    href: 'https://github.com/calimero-network',
    icon: githubIcon,
  },
  { label: 'X', href: 'https://x.com/calimeronetwork', icon: xIcon },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/calimero-network/',
    icon: linkedinIcon,
  },
];

/** The header links. Home is the lockup; Upload is the header's one CTA. */
const HEADER_NAV = navigation.filter(
  item => item.href !== '/' && item.href !== '/upload'
);

const DRAWER_WIDTH = 288;

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

function LineIcon({ svg, className }: { svg: string; className?: string }) {
  return (
    <span
      className={`line-icon ${className ?? ''}`}
      aria-hidden='true'
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * calimero.network's chrome around the registry: a sticky header on the
 * charcoal ground with one hairline under it, the page's faint column lines
 * behind everything, and the landing's footer.
 *
 * The header carries the lockup, three destinations, a "Calimero" menu for
 * the rest of the family, search, the account, and ONE primary call to
 * action (Publish). Below 1100px (where the desktop zoom starts) it collapses to the lockup and a menu button;
 * the menu is a drawer that slides in from the left.
 */
export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  // ⚠️ THREE STATES, NOT A BOOLEAN. A boolean can only mount and unmount, and
  // an unmount cannot be animated. `closing` keeps the drawer in the tree long
  // enough to slide back out; `closed` unmounts it.
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
    // Re-opening mid-exit cancels the unmount.
    return () => window.clearTimeout(id);
  }, [drawer]);

  // The page behind a drawer must not scroll with it.
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
   * POSITION. The drawer slides in over the header, so its mark sits on the
   * same left edge and baseline as the one it covers: same `.shell` gutter,
   * same bar height, same compact size.
   */
  const renderDrawer = () => (
    <div className='flex h-full flex-col'>
      <div className='flex h-16 flex-shrink-0 items-center justify-between border-b border-line pl-4 pr-3 sm:pl-8 lg:pl-16'>
        <Link
          to='/'
          aria-label='Calimero App Registry — home'
          data-testid='rail-brand'
        >
          <RegistryMark variant='compact' />
        </Link>
      </div>
      <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 pt-5 sm:px-8'>
        <GlobalSearch onNavigate={closeDrawer} />

        <nav className='flex flex-col' aria-label='Primary'>
          {navigation.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-${item.name.toLowerCase()}`}
                className={`flex items-center gap-3 border-l-2 py-2.5 pl-3 text-[16px] font-bold uppercase tracking-[0.15em] transition-colors duration-150 ${
                  active
                    ? 'border-brand-600 text-neutral-100'
                    : 'border-transparent text-neutral-400 hover:text-neutral-100'
                }`}
              >
                <item.icon
                  className='h-4 w-4 flex-shrink-0'
                  aria-hidden='true'
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div>
          <p className='eyebrow mb-2 !text-neutral-500'>Calimero</p>
          <ul className='flex flex-col border-l border-line pl-3'>
            {FAMILY.map(item => (
              <li key={item.text}>
                <a
                  href={item.href}
                  target='_blank'
                  rel='noreferrer'
                  className='flex items-center gap-2.5 py-1.5 text-[16px] text-neutral-300 hover:text-neutral-100'
                >
                  <LineIcon
                    svg={item.icon}
                    className='h-5 w-5 flex-shrink-0 text-brand-600'
                  />
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className='mt-auto'>
          <ProfileDropdown
            user={user}
            loading={loading}
            logout={logout}
            side='up'
            onNavigate={closeDrawer}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className='app-frame relative flex flex-col'>
      <ScrollToTop />

      {/* The landing's column lines: five hairlines on the content grid,
          three below 1024px, fixed behind the page. */}
      <div className='grid-lines' aria-hidden='true'>
        <div className='shell'>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      {/* ⚠️ z-50, ABOVE THE SCRIM, so the bar's own close button stays
          pressable while the drawer is open. The drawer is also z-50 and comes
          later, so it still covers the bar's left side as it slides across. */}
      <header
        data-testid='site-header'
        className='sticky top-0 z-50 border-b border-line bg-[var(--app-rail)]'
      >
        <div className='shell flex h-16 items-center justify-between gap-4 min-[1100px]:h-[88px]'>
          <Link
            to='/'
            aria-label='Calimero App Registry — home'
            data-testid='header-brand'
            className='flex-shrink-0'
          >
            <RegistryMark />
          </Link>

          <nav
            data-testid='primary-nav'
            aria-label='Primary'
            className='hidden flex-1 items-center self-stretch min-[1100px]:flex'
          >
            {HEADER_NAV.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                  className={`relative flex h-full items-center px-2.5 text-[15px] font-bold uppercase tracking-[0.14em] transition-colors duration-150 ${
                    active
                      ? 'text-neutral-100'
                      : 'text-neutral-400 hover:text-neutral-100'
                  }`}
                >
                  {item.name}
                  {/* The active marker: a lime rule sitting ON the header's
                      hairline, the width of the label. */}
                  {active && (
                    <span
                      aria-hidden='true'
                      className='absolute inset-x-2.5 -bottom-px h-[2px] bg-brand-600'
                    />
                  )}
                </Link>
              );
            })}
            <FamilyMenu />
          </nav>

          <div className='hidden flex-shrink-0 items-center gap-3 min-[1100px]:flex'>
            <div className='w-48'>
              <GlobalSearch />
            </div>
            <ProfileDropdown
              user={user}
              loading={loading}
              logout={logout}
              side='down'
            />
            <Link to='/upload' data-testid='nav-upload' className='btn-cta'>
              Publish
            </Link>
          </div>

          <button
            onClick={() => setDrawer(d => (d === 'open' ? 'closing' : 'open'))}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className='-mr-1 p-1 text-brand-600 min-[1100px]:hidden'
          >
            <LineIcon
              svg={mobileOpen ? closeIcon : menuIcon}
              className='block h-7 w-7'
            />
          </button>
        </div>
      </header>

      {drawer !== 'closed' && (
        <>
          <button
            aria-label='Close menu'
            tabIndex={-1}
            onClick={closeDrawer}
            className={`fixed inset-0 z-40 bg-black/60 min-[1100px]:hidden ${
              drawer === 'closing'
                ? 'pointer-events-none animate-scrim-out'
                : 'animate-scrim-in'
            }`}
          />
          <aside
            data-testid='sidebar-drawer'
            aria-hidden={drawer === 'closing'}
            className={`fixed inset-y-0 left-0 z-50 max-w-[85vw] border-r border-line bg-[var(--app-rail)] shadow-[0_0_40px_rgba(0,0,0,0.35)] will-change-transform min-[1100px]:hidden ${
              drawer === 'closing' ? 'animate-drawer-out' : 'animate-drawer-in'
            }`}
            style={{ width: DRAWER_WIDTH }}
          >
            {renderDrawer()}
          </aside>
        </>
      )}

      <main className='shell flex-1 pb-20 pt-8 sm:pt-10 lg:pt-14'>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * The rest of the Calimero family, as a hover/focus panel like the landing's
 * "Product" menu. A click toggles it too, so it works without a hover.
 */
function FamilyMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className='group relative flex h-full items-center'
      data-open={open || undefined}
    >
      <button
        type='button'
        aria-expanded={open}
        aria-controls='family-menu'
        onClick={() => setOpen(o => !o)}
        className='flex h-full items-center gap-2 px-2.5 text-[15px] font-bold uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:text-neutral-100'
      >
        Calimero
        <span
          aria-hidden='true'
          className='h-[7px] w-[7px] -translate-y-0.5 rotate-45 border-b-[1.5px] border-r-[1.5px] border-current transition-transform duration-200 group-hover:translate-y-0.5 group-hover:rotate-[225deg] group-data-[open]:translate-y-0.5 group-data-[open]:rotate-[225deg]'
        />
      </button>
      {/* The panel is always in the DOM and shown by hover, focus or a click;
          the bridge above it keeps the pointer's path from the button open. */}
      <ul
        id='family-menu'
        className='menu-panel invisible absolute left-0 top-[calc(100%-8px)] z-50 grid w-[26rem] gap-1 p-2 opacity-0 transition-[opacity,visibility,transform] duration-200 before:absolute before:inset-x-0 before:-top-3 before:h-3 before:content-[""] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 group-data-[open]:visible group-data-[open]:opacity-100'
      >
        {FAMILY.map(item => (
          <li key={item.text}>
            <a
              href={item.href}
              target='_blank'
              rel='noreferrer'
              className='flex items-start gap-3.5 p-3 transition-colors hover:bg-brand-600/[0.08]'
            >
              <LineIcon
                svg={item.icon}
                className='mt-0.5 h-7 w-7 flex-shrink-0 text-brand-600'
              />
              <span className='flex flex-col gap-1'>
                <span className='text-[16px] font-bold uppercase tracking-[0.15em] text-neutral-100'>
                  {item.text}
                </span>
                <span className='text-[16px] font-light leading-snug text-neutral-500'>
                  {item.desc}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** calimero.network's footer: the badge and a line, link columns, a bar. */
function SiteFooter() {
  return (
    <footer className='relative mt-auto overflow-hidden border-t border-line bg-ink/[0.015]'>
      <div className='shell flex flex-col gap-16 pt-16 lg:pt-24'>
        <div className='grid gap-12 xl:grid-cols-[238px_1fr] xl:gap-16'>
          <div>
            <img
              src={badgeVertical}
              alt='Calimero'
              width={238}
              height={110}
              className='hidden h-auto w-[200px] xl:block'
              style={{ filter: 'var(--logo-filter)' }}
            />
            <img
              src={badgeHorizontal}
              alt='Calimero'
              width={476}
              height={55}
              className='h-auto w-[280px] max-w-full xl:hidden'
              style={{ filter: 'var(--logo-filter)' }}
            />
            <p className='mt-6 max-w-[34ch] text-[17px] font-light leading-relaxed text-neutral-500'>
              Signed apps for Calimero, the open-source protocol for sovereign
              apps.{' '}
              <a
                href='https://calimero.network'
                target='_blank'
                rel='noreferrer'
                className='text-brand-600 hover:text-brand-500'
              >
                calimero.network
              </a>
            </p>
          </div>
          <div className='grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6'>
            {FOOTER_LINKS.map(group => (
              <div key={group.heading}>
                <h2 className='text-[15px] font-bold uppercase tracking-[0.24em] text-neutral-100'>
                  {group.heading}
                </h2>
                <ul className='mt-5 flex flex-col gap-0.5'>
                  {group.items.map(item => (
                    <li key={item.label}>
                      {'to' in item ? (
                        <Link
                          to={item.to!}
                          className='block py-1.5 text-[16px] font-light text-neutral-500 transition-opacity hover:opacity-60'
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <a
                          href={item.href}
                          target='_blank'
                          rel='noreferrer'
                          className='block py-1.5 text-[16px] font-light text-neutral-500 transition-opacity hover:opacity-60'
                        >
                          {item.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <h2 className='text-[15px] font-bold uppercase tracking-[0.24em] text-neutral-100'>
                Connect with us
              </h2>
              <ul className='mt-5 flex gap-4'>
                {SOCIAL.map(s => (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      target='_blank'
                      rel='noreferrer'
                      aria-label={s.label}
                      className='block h-9 w-9 text-neutral-500 transition-opacity hover:opacity-60'
                    >
                      <LineIcon svg={s.icon} className='block h-full w-full' />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className='flex flex-col gap-4 border-t border-line py-8 text-[12px] uppercase tracking-[0.23em] lg:flex-row lg:items-center lg:justify-between'>
          <p className='text-neutral-300'>
            © {new Date().getFullYear()} Calimero Network. All rights reserved.
          </p>
          <ul className='flex flex-wrap items-center gap-x-4 gap-y-2 text-neutral-500'>
            <li>
              <a
                href='https://calimero.network/terms'
                target='_blank'
                rel='noreferrer'
                className='hover:text-neutral-300'
              >
                Terms and conditions
              </a>
            </li>
            <li
              aria-hidden='true'
              className='h-1 w-1 rounded-full bg-neutral-500'
            />
            <li>
              <a
                href='https://calimero.network/privacy-policy'
                target='_blank'
                rel='noreferrer'
                className='hover:text-neutral-300'
              >
                Privacy policy
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
