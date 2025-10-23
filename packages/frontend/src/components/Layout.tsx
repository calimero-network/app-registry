import { Link, useLocation } from 'react-router-dom';
import { Package } from 'lucide-react';
import { navigation } from '@/constants/navigation';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className='min-h-screen bg-background-secondary'>
      {/* Header */}
      <header className='bg-background-primary shadow-sm border-b border-neutral-700'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-16'>
            <div className='flex items-center'>
              <Link to='/' className='flex items-center space-x-2'>
                <Package className='h-8 w-8 text-brand-600' />
                <span className='text-xl font-bold text-white'>
                  SSApp Registry
                </span>
              </Link>
            </div>

            <nav className='hidden md:flex space-x-8'>
              {navigation.map(item => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`nav-link ${
                      isActive ? 'nav-link-active' : 'nav-link-inactive'
                    }`}
                  >
                    <item.icon className='h-4 w-4 mr-2' />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className='max-w-7xl mx-auto py-6 sm:px-6 lg:px-8'>
        <div className='px-4 py-6 sm:px-0'>{children}</div>
      </main>

      {/* Footer */}
      <footer className='bg-background-primary border-t border-neutral-700 mt-auto'>
        <div className='max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8'>
          <div className='text-center text-sm text-neutral-300'>
            <p>
              © 2025 Calimero Network App Registry. Built with ❤️ by the{' '}
              <a
                href='https://calimero.network'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand-600 hover:text-brand-500 transition-colors underline'
              >
                Calimero Network
              </a>{' '}
              team.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
