import { Link } from 'react-router-dom';
import notFoundArt from '@/assets/brand/not-found.svg?raw';
import { usePageMeta } from '@/lib/seo';

/**
 * calimero.network's 404, in the registry's shell: the landing's own line
 * drawing, an eyebrow, the title and two ways back.
 */
export default function NotFoundPage() {
  usePageMeta({ title: 'Page not found' });

  return (
    <div className='flex flex-col items-center justify-center py-16 text-center sm:py-24'>
      <div
        className='not-found-art w-full max-w-[36rem]'
        aria-hidden='true'
        dangerouslySetInnerHTML={{ __html: notFoundArt }}
      />
      <p className='eyebrow mt-10'>Error 404</p>
      <h1 className='mt-3 text-lg font-medium text-neutral-100'>
        Page not found
      </h1>
      <p className='mt-4 max-w-[44ch] text-[17px] font-light leading-relaxed text-neutral-400'>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className='mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center'>
        <Link to='/' className='btn-primary'>
          Home
        </Link>
        <Link to='/apps' className='btn-secondary'>
          Browse apps
        </Link>
      </div>
    </div>
  );
}
