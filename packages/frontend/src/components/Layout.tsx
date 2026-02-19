import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Package, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigation } from '@/constants/navigation';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useAuth();

  return (
    <div className='min-h-screen flex flex-col bg-background-secondary'>
      {/* Header */}
      <header className='sticky top-0 z-50 bg-background-primary/80 backdrop-blur-xl border-b border-neutral-800/60'>
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-14'>
            <Link to='/' className='flex items-center gap-2 group'>
              <Package className='h-5 w-5 text-brand-600 transition-transform group-hover:scale-110' />
              <span className='text-sm font-medium text-neutral-200'>
                Calimero Registry
              </span>
            </Link>

            {/* Desktop nav */}
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
              {!loading && (
                user ? (
                  <button
                    type='button'
                    onClick={() => logout()}
                    className='nav-link nav-link-inactive ml-2'
                  >
                    Log out
                  </button>
                ) : (
                  <Link
                    to='/login'
                    className={`nav-link ${location.pathname === '/login' ? 'nav-link-active' : 'nav-link-inactive'} ml-2`}
                  >
                    Sign in
                  </Link>
                )
              )}
            </nav>

            {/* Mobile menu button */}
            <button
              className='md:hidden p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 transition-all'
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

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <nav className='md:hidden border-t border-neutral-800/60 animate-fade-in'>
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
                        ? 'bg-neutral-800/80 text-brand-600'
                        : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
                    }`}
                  >
                    <item.icon className='h-3.5 w-3.5 mr-2.5' />
                    {item.name}
                  </Link>
                );
              })}
              {!loading &&
                (user ? (
                  <button
                    type='button'
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className='flex items-center px-3 py-2 rounded-md text-[13px] font-normal text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 w-full text-left'
                  >
                    Log out
                  </button>
                ) : (
                  <Link
                    to='/login'
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-md text-[13px] font-normal transition-all ${
                      location.pathname === '/login'
                        ? 'bg-neutral-800/80 text-brand-600'
                        : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
                    }`}
                  >
                    Sign in
                  </Link>
                ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main content */}
      <main className='flex-1 max-w-6xl w-full mx-auto py-8 sm:px-6 lg:px-8'>
        <div className='px-4 sm:px-0 animate-fade-in'>{children}</div>
      </main>

      {/* Footer */}
      <footer className='border-t border-neutral-800/60'>
        <div className='max-w-6xl mx-auto py-5 px-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col sm:flex-row items-center justify-between gap-3'>
            <p className='text-[12px] text-neutral-500 font-light'>
              &copy; {new Date().getFullYear()} Calimero Network
            </p>
            <div className='flex items-center gap-5'>
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
                  className='text-[12px] text-neutral-500 hover:text-neutral-300 font-light transition-colors'
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
