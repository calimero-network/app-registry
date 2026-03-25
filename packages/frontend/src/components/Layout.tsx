import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Package, Menu, X, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigation } from '@/constants/navigation';
import { ProfileDropdown } from './ProfileDropdown';
import { AnimatedBackground } from './AnimatedBackground';

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

      <header
        className='sticky top-0 z-50 backdrop-blur-xl border-b border-white/[0.06]'
        style={{ background: 'rgba(10, 10, 10, 0.75)' }}
      >
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-14'>
            <Link to='/' className='flex items-center gap-2.5 group'>
              <div className='relative'>
                <Package className='h-5 w-5 text-brand-600 transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(165,255,17,0.4)]' />
              </div>
              <span className='text-sm font-semibold text-neutral-100 tracking-tight'>
                Calimero Registry
              </span>
            </Link>

            <nav className='hidden md:flex items-center gap-1'>
              {navigation.map(item => {
                const isActive =
                  location.pathname === item.href ||
                  (item.href !== '/' &&
                    location.pathname.startsWith(item.href));
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
        </div>

        {mobileMenuOpen && (
          <nav
            className='md:hidden border-t border-white/[0.06] animate-fade-in'
            style={{ background: 'rgba(10, 10, 10, 0.9)' }}
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

      <main className='flex-1 relative z-10 max-w-6xl w-full mx-auto py-8 sm:px-6 lg:px-8'>
        <div className='px-4 sm:px-0 animate-fade-in'>{children}</div>
      </main>

      <footer
        className='relative z-10 border-t border-white/[0.06]'
        style={{ background: 'rgba(10, 10, 10, 0.6)' }}
      >
        <div className='max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
            <div className='flex items-center gap-2'>
              <Package className='h-3.5 w-3.5 text-brand-600/60' />
              <p className='text-[12px] text-neutral-500 font-light'>
                &copy; {new Date().getFullYear()} Calimero Network
              </p>
            </div>
            <div className='flex items-center gap-6'>
              {[
                { href: 'https://calimero.network', label: 'Website' },
                { href: 'https://docs.calimero.network', label: 'Docs' },
                {
                  href: 'https://github.com/calimero-network',
                  label: 'GitHub',
                },
              ].map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-brand-600 font-light transition-colors duration-200'
                >
                  {link.label}
                  <ExternalLink className='h-2.5 w-2.5' />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
