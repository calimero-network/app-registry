import { useAuth } from '@/contexts/AuthContext';
import { getMyPackages } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Upload, ArrowRight } from 'lucide-react';

export default function MyPackagesPage() {
  const { user } = useAuth();
  const email = user?.email ?? '';

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['my-packages', email],
    queryFn: () => getMyPackages(email),
    enabled: !!email?.trim(),
  });

  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-semibold text-neutral-100 mb-2'>
          My packages
        </h1>
        <p className='text-neutral-400 text-sm'>
          Signed in as {user?.email ?? user?.name ?? 'Unknown'}. Packages whose{' '}
          <code className='text-brand-600'>author</code> matches your email are
          listed below.
        </p>
      </div>

      {/* Upload a new package */}
      <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-6'>
        <div className='flex items-center gap-2 mb-3'>
          <Upload className='w-4 h-4 text-brand-600' />
          <h2 className='text-[14px] font-medium text-neutral-200'>
            Upload a new package
          </h2>
        </div>
        <p className='text-[13px] text-neutral-400 font-light mb-4'>
          Upload your application from the frontend. Use the same email as your
          account for the package author so it appears here.
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
        <h2 className='text-[14px] font-medium text-neutral-200 mb-3'>
          Your packages
        </h2>
        {!email?.trim() ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Package className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              Sign in to see packages you authored. Set{' '}
              <code className='text-brand-600'>metadata.author</code> to your
              account email when publishing so they appear here.
            </p>
          </div>
        ) : isLoading ? (
          <p className='text-neutral-500 text-sm'>Loading…</p>
        ) : packages.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center'>
            <Package className='h-12 w-12 text-neutral-600 mx-auto mb-4' />
            <p className='text-neutral-400 text-sm'>
              No packages yet. Publish a bundle with{' '}
              <code className='text-brand-600'>author</code> set to your email (
              {email}) to see them here.
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
                  className='flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
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
