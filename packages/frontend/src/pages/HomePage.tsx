import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PosterGallery } from '@/components/PosterGallery';
import { type Poster } from '@/components/PosterCard';
import { getApps } from '@/lib/api';
import { AppCard } from '@/components/AppCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ShowcaseCard } from '@/components/ShowcaseCard';
import { HeroGraphic } from '@/components/HeroGraphic';
import { formatCategory } from '@/lib/utils';
import { CATEGORIES, type AppSummary } from '@/types/api';
import { usePageMeta } from '@/lib/seo';

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

/**
 * The "Get started" gallery.
 *
 * Posters, not link rows: each is one graphic with the words set over it. The
 * external ones open a tab; `internal` routes stay in the app. Order matters —
 * the first two are the outbound product links the shelf exists for.
 */
const POSTERS: Poster[] = [
  {
    art: 'desktop',
    eyebrow: 'Run apps locally',
    title: 'Get Calimero Desktop',
    body: 'A node and an app launcher on your own machine. Install anything here in one click.',
    chips: ['macOS', 'Windows', 'Linux'],
    cta: 'Download',
    href: 'https://calimero.network/download',
  },
  {
    art: 'docs',
    eyebrow: 'Learn',
    title: 'Documentation',
    body: 'From an empty directory to a signed bundle published here.',
    chips: ['Quickstart', 'SDKs', 'CLI reference'],
    cta: 'Read the docs',
    href: 'https://docs.calimero.network',
  },
  {
    art: 'publish',
    eyebrow: 'Ship yours',
    title: 'Publish an app',
    body: 'Build with cargo mero, sign the bundle, push it to the registry.',
    chips: ['Build', 'Sign', 'Push'],
    cta: 'How publishing works',
    href: '/docs',
    internal: true,
  },
  {
    art: 'explore',
    eyebrow: 'Browse',
    title: 'Every published app',
    body: 'The whole registry, filtered by category and searchable by name.',
    chips: ['Games', 'Productivity', 'Social'],
    cta: 'Browse the registry',
    href: '/explore',
    internal: true,
  },
  {
    art: 'source',
    eyebrow: 'Peer to peer',
    title: 'Calimero on GitHub',
    body: 'The node, the SDKs and this registry — all of it in the open.',
    chips: ['core', 'SDKs', 'app-registry'],
    cta: 'Open GitHub',
    href: 'https://github.com/calimero-network',
  },
];

export default function HomePage() {
  // The root restores the site defaults, so arriving here from any other page
  // does not leave that page's title in the tab.
  usePageMeta();

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
    <div className='space-y-16 lg:space-y-20'>
      {/* ── The first screen: the promise and a way in, beside the product ──
          calimero.network's hero, sized for an app store rather than a
          landing page: a tracked lime eyebrow, the black uppercase headline
          with its second line in lime, one sentence, and two buttons —
          next to the laptop animation of that promise being kept.

          ⚠️ SIZED AGAINST A 14" LAPTOP'S FOLD. The first featured app must
          be on screen without scrolling (e2e "the fold"); a full-height
          landing hero here would push every app below it, which is the
          failure that removed the original "Discover & Deploy" hero. */}
      <section className='grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 xl:gap-16'>
        <div className='flex flex-col items-start gap-5'>
          <p className='eyebrow'>Signed apps for Calimero</p>
          <h1 className='hero-title text-[40px] text-neutral-100 sm:text-[52px] xl:text-[56px]'>
            App Registry
            <span className='block text-brand-600'>for the node you run</span>
          </h1>
          <p className='max-w-[42ch] text-[18px] font-light leading-relaxed tracking-[0.03em] text-neutral-300'>
            Applications for Calimero — signed, versioned, and installed into a
            node you run yourself.
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <Link to='/explore' className='btn-primary'>
              Browse apps
            </Link>
            <Link to='/upload' className='btn-secondary'>
              Publish an app
            </Link>
          </div>
          {/* The one control on the page that is not navigation, so it sits
              with the fine print rather than in the header with the links
              used every visit. */}
          <div className='flex w-full items-center justify-between gap-4 border-t border-line pt-5'>
            <p className='max-w-[46ch] text-[14px] font-light leading-snug text-neutral-500'>
              Every bundle is checked by the registry, then checked again by the
              node that installs it.
            </p>
            <ThemeToggle />
          </div>
        </div>

        {/* The laptop sits in its own panel: a charcoal surface with one
            hairline and a faint lime bloom behind the device, not over it —
            a blurred light painted over the screen fogs the UI it lights. */}
        <div
          data-testid='hero-panel'
          className='relative overflow-hidden border border-line'
          style={{ background: 'var(--hero-wash)' }}
        >
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 z-0'
          >
            <div
              className='hero-lamp absolute -top-32 left-[18%] h-[26rem] w-[26rem] rounded-full blur-3xl'
              style={{ background: 'var(--hero-glow)' }}
            />
            <div
              className='hero-lamp hero-lamp-b absolute -bottom-40 right-[8%] h-[24rem] w-[30rem] rounded-full blur-3xl'
              style={{ background: 'var(--hero-glow-2)' }}
            />
          </div>

          <div className='relative z-10 px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7'>
            <div className='hero-device mx-auto aspect-[960/508] w-full max-w-[40rem]'>
              <HeroGraphic />
            </div>

            {/* The caption runs on the same 18s cycle as the graphic: line one
                covers browse + install, line two covers using the app. Two
                absolutely-positioned lines in a fixed-height box, so the panel
                does not resize as they swap.

                ⚠️ THE HEIGHT IS PER-BREAKPOINT BECAUSE THE WRAP IS, and the
                overflow is hidden — a box sized for the desktop wrap clips
                the last line through its glyphs on a phone (e2e measures it).

                Reduced motion lands on the base styles — line one visible,
                line two hidden — rather than on an empty box. */}
            <div className='relative mx-auto mt-5 h-[7.4rem] w-full max-w-[40rem] overflow-hidden border-t border-line pt-4 sm:h-[5.2rem]'>
              <p
                data-testid='hero-caption'
                className='hero-line hero-line-a absolute inset-x-0 top-4 text-[17px] font-bold uppercase leading-snug tracking-[0.1em] text-neutral-100 sm:text-[19px]'
              >
                Download Calimero Desktop and install applications from the
                marketplace.
              </p>
              <p className='hero-line hero-line-b absolute inset-x-0 top-4 text-[17px] font-bold uppercase leading-snug tracking-[0.1em] text-neutral-100 sm:text-[19px]'>
                Open the installed application and use it peer-to-peer, its data
                encrypted between peers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          {/* The apps we publish ourselves, as large cards under their own
              section head — which is what separates them from the derived
              shelves below. */}
          <div>
            <SectionHeading eyebrow='Featured' title='Apps we build' />
            <div className='mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {featured.map(app => (
                <ShowcaseCard key={app.id} app={app} />
              ))}
            </div>
          </div>
        </section>
      )}

      {categoriesInUse.length > 0 && (
        <section>
          <SectionHeading eyebrow='Browse' title='By category' />
          <div className='mt-6 flex flex-wrap gap-2'>
            {categoriesInUse.map(c => (
              <Link
                key={c}
                to={`/explore?category=${c}`}
                className='inline-flex items-center gap-1.5 border border-line-strong px-4 py-2.5 text-[14px] font-bold uppercase tracking-[0.15em] text-neutral-300 transition-colors duration-150 hover:border-brand-600 hover:text-brand-600'
              >
                {formatCategory(c)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          eyebrow='The catalogue'
          title='Recently updated'
          href='/explore'
        />
        {isLoading ? (
          <SkeletonList />
        ) : (
          <div className='mt-6 grid gap-3'>
            {recent.map(app => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading eyebrow='Get started' title='Run, build, publish' />
        <div className='mt-6'>
          <PosterGallery posters={POSTERS} />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
}) {
  // The landing's section head: a tracked eyebrow over an uppercase title,
  // with a lime "See all" link at the end of the line.
  return (
    <div className='flex items-end justify-between gap-4 border-b border-line pb-4'>
      <div>
        {eyebrow && <p className='eyebrow mb-2'>{eyebrow}</p>}
        <h2 className='text-[26px] font-black uppercase leading-none tracking-[0.01em] text-neutral-100 sm:text-[32px]'>
          {title}
        </h2>
      </div>
      {href && (
        <Link
          to={href}
          className='whitespace-nowrap text-[14px] font-bold uppercase tracking-[0.17em] text-brand-600 transition-colors hover:text-brand-500'
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
          className='flex animate-pulse gap-4 border border-line p-4'
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
