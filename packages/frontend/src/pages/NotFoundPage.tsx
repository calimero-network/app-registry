import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className='flex flex-col items-center justify-center py-24 text-center'>
      <p className='text-6xl font-semibold text-brand-600/40 tabular-nums'>
        404
      </p>
      <h1 className='mt-3 text-lg font-medium text-neutral-200'>
        Page not found
      </h1>
      <p className='mt-1.5 text-[13px] text-neutral-500 font-light max-w-sm'>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className='mt-8 flex items-center gap-2.5'>
        <Link
          to='/'
          className='inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-neutral-950 text-[13px] font-medium px-4 py-2 rounded-md transition-all'
        >
          <Home className='w-3.5 h-3.5' />
          Home
        </Link>
        <Link
          to='/apps'
          className='inline-flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[13px] font-normal px-4 py-2 rounded-md border border-neutral-700 transition-all'
        >
          <Search className='w-3.5 h-3.5' />
          Browse Apps
        </Link>
      </div>
    </div>
  );
}
