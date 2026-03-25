import { useAuth } from '@/contexts/AuthContext';
import { getMyPackages } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Upload, ArrowRight } from 'lucide-react';

export default function MyPackagesPage() {
  const { user } = useAuth();
  const username = user?.username ?? '';
  const email = user?.email ?? '';

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['my-packages', username, email],
    queryFn: () => getMyPackages({ username, email }),
    enabled: !!username?.trim() || !!email?.trim(),
  });

  return (
    <div className='space-y-8'>
      <div className='animate-fade-in'>
        <h1 className='text-xl font-semibold text-neutral-100 mb-2'>
          My packages
        </h1>
        <p className='text-[13px] text-neutral-400 font-light'>
          Signed in as{' '}
          {user?.username
            ? `@${user.username}`
            : (user?.email ?? user?.name ?? 'Unknown')}
          . Packages whose <code className='text-brand-600'>author</code>{' '}
          matches your username are listed below.
        </p>
      </div>

      {/* Upload a new package */}
      <div className='card p-6 animate-slide-up stagger-1'>
        <div className='flex items-center gap-2 mb-3'>
          <Upload className='w-4 h-4 text-brand-600' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Upload a new package
          </h2>
        </div>
        <p className='text-[13px] text-neutral-400 font-light mb-4'>
          Upload your application from the frontend. New packages are published
          with your username as the public author so they appear here.
        </p>
        <Link
          to='/upload'
          className='inline-flex items-center gap-2 text-[13px] text-brand-600 hover:text-brand-500'
        >
          Upload application
          <ArrowRight className='w-3.5 h-3.5' />
        </Link>
      </div>

      {/* Package list */}
      <div>
        <h2 className='section-heading mb-3'>Your packages</h2>
        {!username?.trim() && !email?.trim() ? (
          <div className='card p-8 text-center'>
            <Package className='h-8 w-8 text-neutral-600 mx-auto mb-4' />
            <p className='text-[13px] text-neutral-400 font-light'>
              Sign in to see packages you authored. Set{' '}
              <code className='text-brand-600'>metadata.author</code> to your
              username when publishing so they appear here.
            </p>
          </div>
        ) : isLoading ? (
          <p className='text-[13px] text-neutral-500 font-light'>Loading…</p>
        ) : packages.length === 0 ? (
          <div className='card p-8 text-center'>
            <Package className='h-8 w-8 text-neutral-600 mx-auto mb-4' />
            <p className='text-[13px] text-neutral-400 font-light'>
              No packages yet. Publish a bundle with{' '}
              <code className='text-brand-600'>author</code> set to your
              username ({username ? `@${username}` : email}) to see them here.
            </p>
            <Link
              to='/upload'
              className='inline-flex items-center gap-2 mt-3 text-brand-600 hover:text-brand-500 text-sm'
            >
              Upload application
              <ArrowRight className='w-3.5 h-3.5' />
            </Link>
          </div>
        ) : (
          <ul className='space-y-2'>
            {packages.map(pkg => (
              <li key={pkg.id}>
                <Link
                  to={`/apps/${pkg.package_name}`}
                  className='card flex items-center justify-between px-4 py-3 hover:border-brand-600/30'
                >
                  <div className='flex items-center gap-3'>
                    <Package className='w-4 h-4 text-neutral-500' />
                    <div>
                      <span className='text-neutral-200 font-medium'>
                        {pkg.alias || pkg.package_name}
                      </span>
                      <span className='text-neutral-500 text-sm ml-2'>
                        {pkg.latest_version}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className='w-4 h-4 text-neutral-500' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
