import { Link, useLocation } from 'react-router-dom';
import { Package, Users, Home } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Apps', href: '/apps', icon: Package },
    { name: 'Developers', href: '/developers', icon: Users },
  ];

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <header className='bg-white shadow-sm border-b border-gray-200'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-16'>
            <div className='flex items-center'>
              <Link to='/' className='flex items-center space-x-2'>
                <Package className='h-8 w-8 text-primary-600' />
                <span className='text-xl font-bold text-gray-900'>
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
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      isActive
                        ? 'border-primary-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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
      <footer className='bg-white border-t border-gray-200 mt-auto'>
        <div className='max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8'>
          <div className='text-center text-sm text-gray-500'>
            <p>
              © 2024 SSApp Registry. Built with ❤️ by the Calimero Network
              team.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
