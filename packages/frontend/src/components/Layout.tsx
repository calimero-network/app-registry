import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigation } from '@/constants/navigation';
import { ProfileDropdown } from './ProfileDropdown';
import { AnimatedBackground } from './AnimatedBackground';
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
      {
        label: 'GitHub',
        href: 'https://github.com/calimero-network',
      },
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

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useAuth();

  return (
    <div className='min-h-screen flex flex-col relative'>
      <AnimatedBackground />

      {/* ── Header ── */}
      <header
        className='sticky top-0 z-50 backdrop-blur-xl'
        style={{
          background: 'rgba(13, 17, 23, 0.8)',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          padding: '0 2rem',
          position: 'sticky',
        }}
      >
        {/* gradient bottom border */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              'linear-gradient(90deg, transparent, rgba(165, 255, 17, 0.3), transparent)',
          }}
        />

        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to='/'
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <img
              src={calimeroLogo}
              alt='Calimero'
              style={{
                height: 26,
                display: 'block',
                filter: 'brightness(0) invert(1)',
                opacity: 0.9,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e =>
                ((e.target as HTMLImageElement).style.opacity = '1')
              }
              onMouseLeave={e =>
                ((e.target as HTMLImageElement).style.opacity = '0.9')
              }
            />
          </Link>

          <nav className='hidden md:flex items-center gap-1'>
            {navigation.map(item => {
              const isActive =
                location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`nav-link ${
                    isActive ? 'nav-link-active' : 'nav-link-inactive'
                  }`}
                >
                  <item.icon className='h-3.5 w-3.5 mr-1.5' />
                  {item.name}
                </Link>
              );
            })}
            <ProfileDropdown user={user} loading={loading} logout={logout} />
          </nav>

          <button
            className='md:hidden p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06] transition-all'
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label='Toggle menu'
          >
            {mobileMenuOpen ? (
              <X className='h-5 w-5' />
            ) : (
              <Menu className='h-5 w-5' />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav
            className='md:hidden animate-fade-in'
            style={{
              position: 'absolute',
              top: 60,
              left: 0,
              right: 0,
              background: 'rgba(13, 17, 23, 0.95)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div className='px-4 py-2 space-y-0.5'>
              {navigation.map(item => {
                const isActive =
                  location.pathname === item.href ||
                  (item.href !== '/' &&
                    location.pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-md text-[13px] font-normal transition-all ${
                      isActive
                        ? 'bg-white/[0.06] text-brand-600'
                        : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                    }`}
                  >
                    <item.icon className='h-3.5 w-3.5 mr-2.5' />
                    {item.name}
                  </Link>
                );
              })}
              <ProfileDropdown
                user={user}
                loading={loading}
                logout={logout}
                compact
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>
          </nav>
        )}
      </header>

      {/* ── Main ── */}
      <main className='flex-1 relative z-10 max-w-6xl w-full mx-auto py-8 sm:px-6 lg:px-8'>
        <div className='px-4 sm:px-0 animate-fade-in'>{children}</div>
      </main>

      {/* ── Footer ── */}
      <footer
        className='relative z-10'
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(13,17,23,0.95) 100%)',
          marginTop: '4rem',
        }}
      >
        {/* gradient top border */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              'linear-gradient(90deg, transparent, rgba(165, 255, 17, 0.3), transparent)',
          }}
        />

        <div
          style={{
            maxWidth: 860,
            margin: '0 auto',
            padding: '3rem 1.5rem 2rem',
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '3rem',
          }}
        >
          {/* Brand column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            <img
              src={calimeroLogo}
              alt='Calimero'
              style={{
                height: 22,
                filter: 'brightness(0) invert(1)',
                opacity: 0.7,
                display: 'block',
              }}
            />
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                margin: 0,
                maxWidth: 200,
                textAlign: 'left',
              }}
            >
              Privacy-preserving infrastructure for decentralised applications.
            </p>
          </div>

          {/* Links columns */}
          <nav
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1.5rem',
            }}
          >
            {FOOTER_LINKS.map(({ heading, items }) => (
              <div key={heading}>
                <h4
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    margin: '0 0 0.75rem',
                  }}
                >
                  {heading}
                </h4>
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                  }}
                >
                  {items.map(({ label, href }) => (
                    <li key={label}>
                      <a
                        href={href}
                        target='_blank'
                        rel='noopener noreferrer'
                        style={{
                          fontSize: '0.83rem',
                          color: 'var(--text-muted)',
                          textDecoration: 'none',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e =>
                          ((e.target as HTMLAnchorElement).style.color =
                            'var(--accent)')
                        }
                        onMouseLeave={e =>
                          ((e.target as HTMLAnchorElement).style.color =
                            'var(--text-muted)')
                        }
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            maxWidth: 860,
            margin: '0 auto',
            padding: '1rem 1.5rem 2rem',
            borderTop: '1px solid rgba(48, 54, 61, 0.5)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            opacity: 0.6,
          }}
        >
          &copy; {new Date().getFullYear()} Calimero Network. All rights
          reserved.
        </div>
      </footer>
    </div>
  );
}
