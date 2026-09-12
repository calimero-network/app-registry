import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';
import { usePageMeta } from '@/lib/seo';

export default function NotFoundPage() {
  usePageMeta({ title: 'Page not found' });

  return (
    <div className='flex flex-col items-center justify-center py-24 text-center'>
      <p className='text-7xl font-bold text-brand-600/30 tabular-nums drop-shadow-[0_0_40px_rgba(165,255,17,0.1)]'>
        404
      </p>
      <h1 className='mt-4 text-lg font-medium text-neutral-200'>
        Page not found
      </h1>
      <p className='mt-1.5 text-[13px] text-neutral-500 font-light max-w-sm'>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className='mt-8 flex items-center gap-2.5'>
        <Link to='/' className='btn-primary'>
          <Home className='w-3.5 h-3.5' />
          Home
        </Link>
        <Link to='/apps' className='btn-secondary'>
          <Search className='w-3.5 h-3.5' />
          Browse Apps
        </Link>
      </div>
    </div>
  );
}
