import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className='flex flex-col items-center justify-center py-24 text-center'>
      <p className='animate-scale-in text-7xl font-bold text-brand-600/30 tabular-nums drop-shadow-[0_0_40px_rgba(165,255,17,0.1)]'>
        404
      </p>
      <h1 className='animate-slide-up stagger-1 mt-4 text-lg font-medium text-neutral-200'>
        Page not found
      </h1>
      <p className='animate-slide-up stagger-2 mt-1.5 text-[13px] text-neutral-500 font-light max-w-sm'>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className='animate-slide-up stagger-3 mt-8 flex items-center gap-2.5'>
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
