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
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl'>
              App Registry
            </h1>
            <p className='mt-2 max-w-2xl text-[13.5px] font-light leading-relaxed text-neutral-400'>
              Applications for Calimero — signed, versioned, and installed into
              a node you run yourself.
            </p>
          </div>
          {/* The one control on the page that is not navigation, so it sits
              out of the reading column rather than in the rail with the
              things you press every visit. */}
          <ThemeToggle />
        </div>

        {/* The laptop sits inside its own lit panel rather than floating on
            the page ground, and it is drawn small inside that panel: at full
            bleed the device was the whole section and the three scenes read
            as a slideshow instead of as one product being used.

            The wash is periwinkle and the lights are indigo — deliberately
            NOT the brand lime. The accent already carries meaning inside the
            animation (selected row, install progress, your own messages), and
            green light behind green UI flattens every one of those. */}
        <div
          data-testid='hero-panel'
          className='relative mt-8 overflow-hidden rounded-[28px] border border-line'
          style={{ background: 'var(--hero-wash)' }}
        >
          {/* ⚠️ BEHIND THE DEVICE, NOT OVER IT. These are stacked at z-0 and
              everything else at z-10: a blurred blob painted over the laptop
              fogs the screen it is supposed to be lighting. They breathe on a
              long, offset cycle so the panel looks lit rather than static —
              opacity only, so it stays on the compositor. */}
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
            {/* ⚠️ SIZED AGAINST A 14" LAPTOP'S FOLD, NOT AGAINST THE PANEL.
                At `max-w-3xl` with the old padding the panel came to 624px
                and the first app card began at y=879 — nineteen pixels below
                an 860px viewport, so the entire first screen was one picture
                and no actual app was visible without scrolling. That is the
                same failure that removed the original "Discover & Deploy"
                hero.

                Still wide enough to carry the panel, which is why it is not
                back at the `max-w-xl` of the first pass — that left a third
                of the box empty on either side. */}
            <div className='hero-device mx-auto aspect-[960/508] w-full max-w-[40rem]'>
              <HeroGraphic />
            </div>

            {/* The caption runs on the same 18s cycle as the graphic: line one
                covers browse + install, line two covers using the app.

                Set large, bold and in the display face — it is the headline
                for the animation above it, not a caption under a figure. Two
                absolutely-positioned lines in a fixed-height box, so the panel
                does not resize as they swap.

                ⚠️ THE HEIGHT IS PER-BREAKPOINT BECAUSE THE WRAP IS. Two lines
                is what these sentences take from `sm` up; at 360px they take
                four, and a box sized for the desktop wrap clipped the last
                line through the middle of its glyphs — the overflow is
                hidden, so it looked like a rendering fault rather than a
                height that was too small.

                Reduced motion lands on the base styles — line one visible,
                line two hidden — rather than on an empty box. */}
            <div className='relative mx-auto mt-5 h-[6.2rem] w-full max-w-[40rem] overflow-hidden sm:h-[4.1rem]'>
              <p
                data-testid='hero-caption'
                className='hero-line hero-line-a absolute inset-x-0 top-0 font-display text-[18px] font-bold leading-snug tracking-tight text-neutral-100 sm:text-[23px]'
              >
                Download Calimero Desktop and install applications from the
                marketplace.
              </p>
              <p className='hero-line hero-line-b absolute inset-x-0 top-0 font-display text-[18px] font-bold leading-snug tracking-tight text-neutral-100 sm:text-[23px]'>
                Open the installed application and use it peer-to-peer, fully
                encrypted.
              </p>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          {/* One panel holding the whole shelf, rather than three cards
              floating on the page ground. It groups the apps we publish
              ourselves into a single object, which is what separates them
              from the derived shelves below. */}
          <div className='rounded-2xl border border-line bg-ink/[0.02] p-4 sm:p-5'>
            <SectionHeading title='Apps we build' />
            <div className='mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {featured.map(app => (
                <ShowcaseCard key={app.id} app={app} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionHeading title='Get started' />
        <div className='mt-3'>
          <PosterGallery posters={POSTERS} />
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
                className='inline-flex items-center gap-1.5 rounded-full border border-line bg-ink/[0.02] px-3 py-1.5 text-[12.5px] text-neutral-300 transition-colors duration-150 hover:border-line-strong hover:text-neutral-100'
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
          className='flex animate-pulse gap-4 rounded-xl border border-line p-4'
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
