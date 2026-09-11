import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppIcon } from './AppIcon';
import { APP_ART } from './AppArt';
import { getPackageAssets } from '@/lib/api';
import type { AppSummary } from '@/types/api';

/**
 * A large front-page tile for a featured app.
 *
 * The brief was to hard-code screenshots for mero-chat, mero-design and
 * mero-sign "because these apps are ours". Committing three PNGs into the
 * frontend would have meant images that drift from the apps and cannot change
 * without a deploy — so instead this reads the package's real assets, which
 * the registry can now store (asset upload). Upload a screenshot for an app
 * and this tile shows it; upload a better one and the tile updates with no
 * code change.
 *
 * Until a screenshot exists it falls back to the app's icon on a tinted
 * ground, which is a deliberate, finished-looking state rather than an empty
 * frame.
 *
 * The featured list still lives in one place (`FEATURED` in HomePage) so it
 * stays trivially editable — and an id that no longer matches a published
 * package renders nothing rather than an empty card.
 */
export function ShowcaseCard({ app }: { app: AppSummary }) {
  const { data } = useQuery({
    queryKey: ['assets', app.package_name],
    queryFn: () => getPackageAssets(app.package_name),
  });

  const shot = data?.assets?.find(a => a.kind === 'image');
  // A hand-drawn miniature of the app's actual interface, for the ones we
  // build. An uploaded screenshot still wins — the drawing is a stand-in
  // until there is a real one, not a permanent substitute.
  const Art = APP_ART[app.package_name];

  return (
    <Link
      to={`/apps/${encodeURIComponent(app.id)}`}
      data-testid='showcase-card'
      className='group flex flex-col overflow-hidden rounded-2xl border border-line bg-ink/[0.02] transition-colors duration-150 hover:border-line-strong'
    >
      <div className='relative h-44 overflow-hidden bg-ink/[0.03]'>
        {shot ? (
          <img
            src={shot.url}
            alt=''
            loading='lazy'
            decoding='async'
            className='h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]'
          />
        ) : Art ? (
          <Art className='h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]' />
        ) : (
          <div className='flex h-full items-center justify-center'>
            <AppIcon
              icon={app.icon}
              name={app.name}
              seed={app.package_name}
              size={64}
            />
          </div>
        )}
      </div>

      <div className='flex flex-1 flex-col gap-1 p-4'>
        <h3 className='text-[14px] font-medium text-neutral-100'>{app.name}</h3>
        {app.description && (
          <p
            className='text-[12.5px] font-light leading-relaxed text-neutral-400'
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {app.description}
          </p>
        )}
      </div>
    </Link>
  );
}
