import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DesktopArt, DocsArt } from '@/components/PromoArt';
import { getApps } from '@/lib/api';
import { AppCard } from '@/components/AppCard';
import { ShowcaseCard } from '@/components/ShowcaseCard';
import { HeroGraphic } from '@/components/HeroGraphic';
import { formatCategory } from '@/lib/utils';
import { CATEGORIES, type AppSummary } from '@/types/api';

/**
 * The storefront front page.
 *
 * Shaped like Apple's Discover: a short statement of what this is, then
 * shelves you can click. It replaced a centred marketing hero that filled the
 * first screen with a claim and pushed the actual apps below the fold.
 *
 * The featured list is the one hard-coded thing here, kept in a single
 * constant so it stays trivially editable. An id that no longer matches a
 * published package drops out — an entry must never render an empty card.
 *
 * Everything else is derived. "Recently updated" sorts on the registry's own
 * `publishedAt`, so a shelf cannot go stale or point at a yanked package the
 * way a curated list would.
 */
const FEATURED = [
  'com.calimero.mero-chat',
  'com.calimero.mero-design',
  'com.calimero.mero-sign',
];

const PROMOS = [
  {
    art: DesktopArt,
    eyebrow: 'Run apps locally',
    title: 'Get Calimero Desktop',
    body: 'A node and an app launcher on your own machine. Install anything here in one click.',
    href: 'https://calimero.network/download',
  },
  {
    art: DocsArt,
    eyebrow: 'Build one',
    title: 'Documentation',
    body: 'From an empty directory to a signed bundle published here.',
    href: 'https://docs.calimero.network',
  },
];

export default function HomePage() {
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  const all = apps as AppSummary[];
  const byId = new Map(all.map(a => [a.id, a]));
  // `.filter` matters: a featured id that is no longer published must vanish,
  // not render a card with no data in it.
  const featured = FEATURED.map(id => byId.get(id)).filter(
    (a): a is AppSummary => !!a
  );
  const featuredIds = new Set(featured.map(a => a.id));

  // Bundles published before the metadata policy have no `publishedAt`. They
  // sort last rather than being dropped — an app with no timestamp is still
  // an app, and excluding them would hide a third of the registry.
  const recent = all
    .filter(a => !featuredIds.has(a.id))
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
      return tb - ta;
    })
    .slice(0, 6);

  const categoriesInUse = CATEGORIES.filter(c =>
    all.some(a => a.category === c)
  );

  return (
    <div className='space-y-14'>
      <section>
        {/* Title and one line of copy. The three-point list that was here
            said the same thing at four times the length; the animation below
            shows it instead. */}
        {/* Title, then description under it, then the animation with room
            above it. Stacked rather than inline: the subtitle is a sentence,
            not a tagline, and sitting it beside the title made both harder
            to read. */}
        <h1 className='text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl'>
          App Registry
        </h1>
        <p className='mt-2 max-w-2xl text-[13.5px] font-light leading-relaxed text-neutral-400'>
          Applications for Calimero — signed, versioned, and installed into a
          node you run yourself.
        </p>

        {/* Full width and tall: this is the explanation, so it has to be big
            enough to read as a sequence rather than as decoration. */}
        <div className='mt-10 aspect-[960/560] w-full'>
          <HeroGraphic />
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          <SectionHeading title='Apps we build' />
          <div className='mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {featured.map(app => (
              <ShowcaseCard key={app.id} app={app} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading title='Get started' />
        <div className='mt-3 grid gap-3 sm:grid-cols-2'>
          {PROMOS.map(p => (
            <a
              key={p.title}
              href={p.href}
              target='_blank'
              rel='noreferrer'
              // NOT AppCard: these are outbound links, not installable apps.
              // Rendering them as app cards would imply /apps/:id routing and
              // make a docs site look like something you can install.
              data-testid='promo-tile'
              className='group flex gap-4 rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-4 transition-colors duration-150 hover:border-ink/[0.14]'
            >
              <span className='h-20 w-28 flex-shrink-0 text-neutral-200'>
                <p.art className='h-full w-full' />
              </span>
              <span className='min-w-0'>
                <span className='block text-[10.5px] font-medium uppercase tracking-wider text-neutral-500'>
                  {p.eyebrow}
                </span>
                <span className='mt-0.5 block text-[14px] font-medium text-neutral-100'>
                  {p.title}
                </span>
                <span className='mt-1 block text-[12.5px] font-light leading-relaxed text-neutral-400'>
                  {p.body}
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {categoriesInUse.length > 0 && (
        <section>
          <SectionHeading title='Browse by category' />
          <div className='mt-3 flex flex-wrap gap-1.5'>
            {categoriesInUse.map(c => (
              <Link
                key={c}
                to={`/explore?category=${c}`}
                className='inline-flex items-center gap-1.5 rounded-full border border-ink/[0.08] bg-ink/[0.02] px-3 py-1.5 text-[12.5px] text-neutral-300 transition-colors duration-150 hover:border-ink/[0.16] hover:text-neutral-100'
              >
                {formatCategory(c)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading title='Recently updated' href='/explore' />
        {isLoading ? (
          <SkeletonList />
        ) : (
          <div className='mt-3 grid gap-3'>
            {recent.map(app => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className='flex items-baseline justify-between'>
      <h2 className='text-[15px] font-medium text-neutral-200'>{title}</h2>
      {href && (
        <Link
          to={href}
          className='text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-300'
        >
          See all
        </Link>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className='mt-3 grid gap-3'>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className='flex animate-pulse gap-4 rounded-xl border border-ink/[0.06] p-4'
        >
          <div className='h-14 w-14 flex-shrink-0 rounded-xl bg-ink/[0.06]' />
          <div className='flex-1 space-y-2 pt-1'>
            <div className='h-3.5 w-1/3 rounded bg-ink/[0.06]' />
            <div className='h-3 w-full rounded bg-ink/[0.06]' />
          </div>
        </div>
      ))}
    </div>
  );
}
