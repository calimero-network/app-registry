import { test, expect } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test.describe('vertical rail', () => {
  test('renders as a sidebar and routes', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByTestId('sidebar');
    await expect(rail).toBeVisible();

    // Vertical, not horizontal: the rail is taller than it is wide and starts
    // at the top-left. Asserting on the class would pass even if the layout
    // were still a header, so measure the box.
    const box = await rail.boundingBox();
    expect(box!.height).toBeGreaterThan(box!.width);
    expect(box!.x).toBeLessThan(10);

    await page.getByTestId('nav-explore').click();
    await expect(page).toHaveURL(/\/explore/);
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  });
});

test.describe('global search', () => {
  test('filters from the rail and puts the term in the URL', async ({
    page,
  }) => {
    await page.goto('/explore');
    await page.getByTestId('global-search').fill('battleships');

    // The URL is the point: the old search lived in component state and was
    // lost on navigation, so it could not be shared or reloaded.
    await expect(page).toHaveURL(/[?&]q=battleships/);
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByTestId('app-card')).toContainText('Battleships');
  });

  test('a searched URL loads already filtered', async ({ page }) => {
    await page.goto('/explore?q=chat');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByTestId('app-card')).toContainText('Mero Chat');
  });

  test('does NOT search descriptions', async ({ page }) => {
    // Inverted deliberately. Descriptions run to a couple of hundred words, so
    // including them makes a short query match nearly everything and the
    // result count stops meaning anything. "geofencing" appears only in Mero
    // Tag's description, so a description-searching build returns 1 here.
    await page.goto('/explore?q=geofencing');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('app-card')).toHaveCount(0);
  });

  test('matches on the package id and on the creator', async ({ page }) => {
    await page.goto('/explore?q=mero-chat');
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.goto('/explore?q=calimero-network');
    await expect(page.getByTestId('app-card')).toHaveCount(4);
  });
});

test.describe('explore', () => {
  test('lists every app', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('app-card')).toHaveCount(BUNDLES.length);
  });

  test('filters by category and stays linkable', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('category-productivity').click();

    await expect(page).toHaveURL(/category=productivity/);
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('app-card')).toHaveCount(1);
  });

  test('resolves a category from the singular `game` tag', async ({ page }) => {
    // battleships declares no `category`, only `tags: ['game', ...]`. Until a
    // cargo-mero release carries the field that is how every app is
    // categorised, so reading metadata.category alone would show no chip.
    await page.goto('/explore');
    await page.getByTestId('category-games').click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByTestId('app-card')).toContainText('Battleships');
  });

  test('clears filters back to the full list', async ({ page }) => {
    await page.goto('/explore?q=battleships&category=games');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await page.getByTestId('clear-filters').click();
    await expect(page.getByTestId('app-card')).toHaveCount(BUNDLES.length);
  });

  test('shows an empty state rather than a blank page', async ({ page }) => {
    await page.goto('/explore?q=zzzznope');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('app-card')).toHaveCount(0);
  });

  test('/apps still resolves, for older links', async ({ page }) => {
    await page.goto('/apps');
    await expect(page).toHaveURL(/\/explore/);
  });
});

test.describe('app card', () => {
  test('carries icon, title, creator, size and downloads', async ({ page }) => {
    await page.goto('/explore?q=sheets');
    const card = page.getByTestId('app-card').first();

    await expect(card).toContainText('Mero Sheets');
    await expect(card).toContainText('calimero-network');
    await expect(card).toContainText('340');
    await expect(card).toContainText('1.2 MB');
    await expect(card).toContainText('2 days ago');
    await expect(card.locator('img')).toBeVisible();
  });

  test('an app with no icon, size or date renders a fallback and no nonsense', async ({
    page,
  }) => {
    // This is the assertion that matters most: a third of production is in
    // this shape, and the failure mode is confident garbage — "0 bytes",
    // "Invalid Date", or a broken-image glyph.
    await page.goto('/explore?q=mero%20tag');
    const card = page.getByTestId('app-card').first();

    await expect(card.getByTestId('app-icon-fallback')).toBeVisible();
    await expect(card).not.toContainText('Invalid Date');
    await expect(card).not.toContainText('NaN');
    await expect(card).not.toContainText('0 B');
    await expect(card).toContainText('Mero Tag');
  });

  test('opens the detail page', async ({ page }) => {
    await page.goto('/explore?q=sheets');
    await page.getByTestId('app-card').first().click();
    await expect(page).toHaveURL(/\/apps\/com\.calimero\.mero-sheets/);
  });
});

test.describe('home', () => {
  test('leads with apps, not a marketing hero', async ({ page }) => {
    await page.goto('/');
    // The old hero put "Discover & Deploy" in the first screen and the apps
    // below the fold.
    await expect(page.locator('body')).not.toContainText('Discover & Deploy');
    await expect(page.getByTestId('app-card').first()).toBeVisible();
  });

  test('a category link lands on a filtered Explore', async ({ page }) => {
    await page.goto('/');
    // Exact: a card's category chip also contains the word, so a substring
    // match is ambiguous between the filter link and an app link.
    await page
      .getByRole('link', { name: 'Communication', exact: true })
      .click();
    await expect(page).toHaveURL(/category=communication/);
    await expect(page.getByTestId('app-card')).toHaveCount(1);
  });
});

test.describe('motion', () => {
  test('honours prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/explore');
    const card = page.getByTestId('app-card').first();
    await expect(card).toBeVisible();

    const duration = await card.evaluate(
      el => getComputedStyle(el).transitionDuration
    );
    // The reduce block clamps to 0.01ms; anything longer means it did not apply.
    expect(parseFloat(duration)).toBeLessThan(0.05);
  });

  test('no staggered entrance classes survive', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('app-card').first()).toBeVisible();
    const staggered = await page
      .locator('[class*="stagger-"], [class*="animate-slide-up"]')
      .count();
    expect(staggered).toBe(0);
  });
});

test.describe('sign in', () => {
  test('goes straight to Google, with no interstitial', async ({ page }) => {
    await page.goto('/');
    const signIn = page.getByTestId('sign-in');
    await expect(signIn).toBeVisible();
    // A real href, not a router push: this leaves the SPA for the provider.
    await expect(signIn).toHaveAttribute('href', '/api/auth/google');
  });

  test('the sign-in button is as wide as the nav items', async ({ page }) => {
    await page.goto('/');
    const nav = await page.getByTestId('nav-explore').boundingBox();
    const signIn = await page.getByTestId('sign-in').boundingBox();
    expect(Math.abs(nav!.width - signIn!.width)).toBeLessThan(2);
  });

  test('a failed sign-in surfaces as a toast, not a blank page', async ({
    page,
  }) => {
    // /login cannot be deleted — lib/api.ts and ProtectedRoute both navigate
    // there on their own. It must turn ?error into something visible, or a
    // failed login fails silently.
    await page.goto('/login?error=oauth_failed');
    const toast = page.getByTestId('toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Google sign-in failed');
  });

  test('an expired session still lands somewhere that explains itself', async ({
    page,
  }) => {
    await page.goto('/login?error=session_expired&from=%2Fupload');
    await expect(page.getByTestId('toast')).toContainText('session expired');
  });
});

test.describe('light / dark', () => {
  // ⚠️ THE OS PREFERENCE IS EMULATED AS DARK HERE ON PURPOSE. Light is the
  // default whatever the desktop says, and Playwright emulates LIGHT by
  // default — so a suite that left it alone would pass against a build that
  // still followed the OS.
  test.use({ colorScheme: 'dark' });

  test('opens in light mode even on a dark desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the first paint is light, before any script runs', async ({ page }) => {
    // The base palette in index.css is the DARK one — light is an override
    // on `[data-theme='light']`. Applying that from the module only means the
    // browser paints a dark ground first and swaps it, on every load. The
    // attribute is in the served HTML, so read the markup rather than the
    // DOM, which would show whatever JavaScript did to it afterwards.
    const res = await page.request.get('/');
    expect(await res.text()).toContain('<html lang="en" data-theme="light">');
  });

  test('an old auto-written preference does not count as a choice', async ({
    page,
  }) => {
    // ⚠️ THE DEFAULT REACHED NOBODY WITHOUT THIS. The previous build wrote
    // the theme on every mount rather than on every press, so the value it
    // resolved from the OS was persisted as though it had been chosen —
    // meaning every existing visitor carried `dark` as a "choice" they never
    // made, and a stored choice beats the default. The old key is abandoned.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('registry:theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(
      await page.evaluate(() => localStorage.getItem('registry:theme'))
    ).toBeNull();
  });

  test('loading the page records no choice at all', async ({ page }) => {
    // The other half of the same bug: nothing may be written until the
    // toggle is actually pressed, or the next default change is invisible in
    // exactly the same way.
    await page.goto('/');
    await page.getByTestId('theme-toggle').waitFor();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter(k => k.startsWith('registry:theme'))
      )
    ).toEqual([]);
  });

  test('the toggle flips the theme and survives a reload', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // And a stored choice still beats the default on a fresh load.
    await page.goto('/explore');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('light mode actually inverts the ground and the text', async ({
    page,
  }) => {
    // Asserting the attribute alone would pass even if no colour moved — the
    // whole risk here is a `data-theme` that flips while ~580 hardcoded
    // utilities stay dark. So compare rendered pixels.
    await page.goto('/explore');
    const card = page.getByTestId('app-card').first();
    await expect(card).toBeVisible();

    const read = async () =>
      page.evaluate(() => {
        const el = document.querySelector(
          '[data-testid="app-card"] h3'
        ) as HTMLElement;
        return {
          body: getComputedStyle(document.body).backgroundColor,
          heading: getComputedStyle(el).color,
        };
      });

    // Light is where the app starts now, so this reads light first and
    // toggles INTO dark; the comparison is the same either way.
    const light = await read();
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await read();

    expect(light.body).not.toBe(dark.body);
    // `text-neutral-100` means "most prominent text". In light mode it must
    // become dark ink, not stay near-white on white.
    expect(light.heading).not.toBe(dark.heading);

    const lum = (rgb: string) => {
      const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum(light.body)).toBeGreaterThan(200); // a light page
    expect(lum(light.heading)).toBeLessThan(80); // dark text on it
  });

  test('the lime accent does not stay lime as text in light mode', async ({
    page,
  }) => {
    // #a5ff11 on white is about 1.4:1. It has to become the deep green.
    // No toggle press: light is already what the page opens in.
    await page.goto('/');
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-text-rgb')
        .trim()
    );
    expect(accent).not.toBe('165 255 17');
  });
});

test.describe('separators', () => {
  // ⚠️ MEASURED, NOT ASSERTED ON A CLASS NAME. The bug this pins was 77 call
  // sites reading `border-ink/[0.06]` — perfectly correct-looking markup that
  // rendered a #f1f1f1 line on a white page. Every class-based assertion in
  // the world passes against that. So: composite the border over its own
  // background and demand a real difference.
  // ⚠️ COMPOSITE FIRST. `getComputedStyle` hands back a border's OWN colour,
  // so `rgba(19, 18, 21, 0.06)` — a line nobody can see — reads as 233 away
  // from a white page if you simply subtract the channels. The first version
  // of this spec did exactly that and passed against the bug it was written
  // for. Alpha has to be flattened onto the ground before anything is
  // compared.
  const over = (c: string, ground: number[]) => {
    const [r, g, b, a = 1] = c.match(/[\d.]+/g)!.map(Number);
    return [r, g, b].map((ch, i) => ch * a + ground[i] * (1 - a));
  };
  const delta = (a: string, b: string) => {
    const ground = b.match(/[\d.]+/g)!.map(Number);
    const fa = over(a, ground);
    const fb = over(b, ground);
    return Math.max(...fa.map((ch, i) => Math.abs(ch - fb[i])));
  };

  for (const theme of ['light', 'dark'] as const) {
    test(`a card's edge is visible against the page in ${theme} mode`, async ({
      page,
    }) => {
      // Through storage, not by setting the attribute: this is the path a
      // visitor takes, and it also proves the choice still drives the theme.
      await page.addInitScript(t => {
        localStorage.setItem('registry:theme:choice', t as string);
      }, theme);
      await page.goto('/explore');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('app-card').first()).toBeVisible();

      const read = await page.evaluate(() => {
        const card = document.querySelector(
          '[data-testid="app-card"]'
        ) as HTMLElement;
        // ⚠️ TWO ELEMENTS, DELIBERATELY. The card's border comes from the
        // component layer and the rail's from a swept utility class. They
        // were two different tokens, so a spec that read only the card
        // passed while every separator on the page was still invisible.
        // They are one token now, and this is what holds them to it.
        const rail = document.querySelector(
          '[data-testid="sidebar"]'
        ) as HTMLElement;
        return {
          card: getComputedStyle(card).borderTopColor,
          rail: getComputedStyle(rail).borderRightColor,
          page: getComputedStyle(document.body).backgroundColor,
        };
      });

      // Measured: the old 6%-ink hairline composites to 14 away from the
      // page, the #e4e4e6 line to 24, and dark mode's to 22. 18 is the gap
      // between them, so this fails on the hairline and passes on a line.
      expect(delta(read.card, read.page)).toBeGreaterThan(18);
      expect(delta(read.rail, read.page)).toBeGreaterThan(18);
      // The same declared value, not merely two visible ones.
      expect(read.card).toBe(read.rail);
    });
  }
});

test.describe('the accent as text', () => {
  test('the registry lockup clears AA against the rail in light mode', async ({
    page,
  }) => {
    // The label is 8px, bold, uppercase and tracked — the least forgiving
    // text in the app — and it is painted in the same token as every link
    // and every inline code span. A ratio, not a class: the token moved
    // twice already and the markup never changed either time.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const ratio = await page.evaluate(() => {
      const label = document
        .querySelector(
          '[data-testid="rail-brand"] [data-testid="registry-mark"]'
        )!
        .querySelector('span:last-child') as HTMLElement;
      const rail = document.querySelector(
        '[data-testid="sidebar"]'
      ) as HTMLElement;
      const lin = (c: string) =>
        c
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map(v => {
            const x = v / 255;
            return x <= 0.03928
              ? x / 12.92
              : Math.pow((x + 0.055) / 1.055, 2.4);
          });
      const L = (c: string) => {
        const [r, g, b] = lin(c);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = L(getComputedStyle(label).color);
      const b = L(getComputedStyle(rail).backgroundColor);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    });

    expect(ratio).toBeGreaterThan(4.5);
  });
});

test.describe('home shelves', () => {
  test('leads with a title and an explanation', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'App Registry', level: 1 })
    ).toBeVisible();
    // The three-point list this used to assert on is gone — the hero
    // animation says the same thing. The one-line subtitle is what remains.
    await expect(page.locator('main')).toContainText(
      'signed, versioned, and installed into a node you run yourself'
    );
  });

  test('the hero animates without JavaScript', async ({ page }) => {
    // A rAF loop on the front page runs forever in every open tab. This is a
    // pure-SVG/CSS graphic, so it also inherits prefers-reduced-motion.
    await page.goto('/');
    await expect(page.getByTestId('hero-graphic')).toBeAttached();
    const animateEls = await page
      .locator(
        '[data-testid="hero-graphic"] animate, [data-testid="hero-graphic"] animateMotion'
      )
      .count();
    expect(animateEls).toBeGreaterThan(0);
  });

  test('the get-started gallery is links, not app cards', async ({ page }) => {
    // Rendering an outbound link as an AppCard would imply /apps/:id routing
    // and make a docs site look installable.
    await page.goto('/');
    const promos = page.getByTestId('promo-tile');
    await expect(promos).toHaveCount(5);
    await expect(promos.first()).toHaveAttribute('href', /calimero\.network/);
    // Two of the five are in-app routes; they must render as router links
    // rather than as tabs opening onto the same origin.
    await expect(page.getByTestId('promo-tile').nth(3)).toHaveAttribute(
      'href',
      '/explore'
    );
  });

  test('the hero caption names both halves of the journey', async ({
    page,
  }) => {
    // The two lines swap on the animation's own 18s cycle, so both are in the
    // DOM the whole time — this asserts the copy, not the timing.
    await page.goto('/');
    await expect(page.getByTestId('hero-caption')).toContainText(
      'Download Calimero Desktop'
    );
    await expect(page.locator('[data-testid="hero-panel"]')).toContainText(
      'peer-to-peer'
    );
  });

  test('featured apps render large cards, and unknown ids drop out', async ({
    page,
  }) => {
    // The fixture publishes mero-chat but neither mero-design nor mero-sign,
    // so exactly one showcase card should survive — an id with no package
    // must render nothing rather than an empty frame.
    await page.goto('/');
    await expect(page.getByTestId('showcase-card')).toHaveCount(1);
    await expect(page.getByTestId('showcase-card')).toContainText('Mero Chat');
  });

  test('a featured app is not repeated in Recently updated', async ({
    page,
  }) => {
    await page.goto('/');
    const recent = page.getByTestId('app-card');
    await expect(recent).toHaveCount(3); // 4 fixture apps minus the featured one
  });
});

test.describe('the fold', () => {
  // A 14" MacBook: 1512x982 logical, ~860 of it left once the browser's own
  // chrome is off. The most common laptop this site is read on.
  test.use({ viewport: { width: 1512, height: 860 } });

  test('a real app is visible without scrolling', async ({ page }) => {
    // ⚠️ MEASURED AGAINST THE VIEWPORT, NOT A PIXEL HEIGHT. The hero panel
    // was 624px and the first card began at y=879 — nineteen pixels under the
    // fold, so the whole first screen was one picture of a laptop. Asserting
    // "the panel is under 500px" would go stale the moment anything above it
    // changes height; what matters is that an app is on screen.
    await page.goto('/');
    const card = page.getByTestId('showcase-card').first();
    await expect(card).toBeVisible();

    const top = await card.evaluate(el => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(860);
    // And not merely peeking: enough of it to read.
    expect(top).toBeLessThan(780);
  });
});

test.describe('explore card width', () => {
  test('a card is the same width filtered down to one as it is unfiltered', async ({
    page,
  }) => {
    // Two separate causes, both fixed: a two-column grid rendering a lone
    // result at half width, and the scrollbar disappearing when the page
    // stops scrolling. Measuring the box is the only way to catch either —
    // asserting on classes would pass with the layout still moving.
    await page.goto('/explore');
    const all = await page.getByTestId('app-card').first().boundingBox();

    await page.goto('/explore?category=communication');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    const one = await page.getByTestId('app-card').first().boundingBox();

    expect(one!.width).toBe(all!.width);
  });
});

test.describe('live app preview', () => {
  test.beforeEach(async ({ page }) => {
    // The shared stub answers `/v2/bundles` with every bundle whatever the
    // query, which is fine for the listing but wrong for a detail page: it
    // would render whichever bundle happens to be first, not mero-chat. This
    // route honours `?package=`. Registered after the shared one, and
    // Playwright matches in reverse, so it wins.
    await page.route('**/api/v2/bundles**', route => {
      const pkg = new URL(route.request().url()).searchParams.get('package');
      route.fulfill({
        json: pkg ? BUNDLES.filter(b => b.package === pkg) : BUNDLES,
      });
    });
    // `.invalid` never resolves; the frame has to be fulfilled locally or the
    // spec waits on DNS.
    await page.route('https://mero-chat.invalid/**', route =>
      route.fulfill({ contentType: 'text/html', body: '<h1>framed</h1>' })
    );
  });

  test('the frame fills its tile and zooms smoothly rather than snapping', async ({
    page,
  }) => {
    // ⚠️ THIS IS THE REGRESSION THAT LOOKED LIKE A DESIGN CHOICE. Tailwind v4
    // emits `scale-*` as the standalone `scale:` property, which a
    // `transition-property: transform` cannot tween — so the preview jumped
    // between two sizes instantly. And a fit factor written as
    // `calc(100cqw / 1440)` is a LENGTH, which `scale()` rejects, leaving the
    // transform at `none` and the frame at 1440px inside a 900px tile.
    // Reading the computed matrix catches both; reading the class list
    // catches neither.
    await page.goto('/apps/com.calimero.mero-chat');
    const tile = page.getByTestId('open-app');
    await expect(tile).toBeVisible();

    const scaleOf = () =>
      page.evaluate(() => {
        const m = getComputedStyle(
          document.querySelector('.preview-frame')!
        ).transform;
        return m === 'none' ? null : Number(m.split('(')[1].split(',')[0]);
      });

    const rest = await scaleOf();
    expect(rest).not.toBeNull();

    // Covering the tile, not sitting in the middle of it as a small square.
    // The tolerance is the tile's 1px border on each side: the frame fills
    // the content box, which is 2px narrower than the measured box.
    const box = (await tile.boundingBox())!;
    expect(rest! * 1440).toBeGreaterThanOrEqual(box.width - 3);
    expect(rest! * 900).toBeGreaterThanOrEqual(box.height - 3);

    await tile.hover();
    await page.waitForTimeout(120);
    const midway = await scaleOf();
    await page.waitForTimeout(900);
    const settled = await scaleOf();

    // Partway at 120ms and larger still once the 700ms transition is done:
    // that ordering is what "it animates" means, and it is exactly what the
    // snapping version failed.
    expect(midway!).toBeGreaterThan(rest!);
    expect(settled!).toBeGreaterThan(midway!);
    expect(settled!).toBeCloseTo(rest! * 1.12, 3);
  });
});

test.describe('get-started gallery', () => {
  test('the arrows step it, and only the shown slide is reachable', async ({
    page,
  }) => {
    // ⚠️ THE ARROWS WERE UNCLICKABLE. The active slide is `z-10` and its
    // scrim is `absolute inset-0`, so controls at the default stacking level
    // sat underneath it — visible and hoverable, but every click landed on
    // the poster link behind them. Nothing about the markup looked wrong;
    // only pressing them showed it.
    await page.goto('/');
    const dots = page.getByTestId('poster-dot');
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    await page.getByTestId('poster-right').click();
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page).toHaveURL('/'); // i.e. the click did not follow a link

    await page.getByTestId('poster-left').click();
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    // All five stay mounted so the crossfade has something to cross to, but
    // four of them must be out of the tab order and out of the a11y tree.
    const focusable = page.locator('[data-testid="promo-tile"][tabindex="0"]');
    await expect(focusable).toHaveCount(1);
  });
});

test.describe('scroll position', () => {
  test('following a link lands at the top of the next page', async ({
    page,
  }) => {
    // React Router does not reset the scroll offset, so "See all" from the
    // bottom of the home page opened Explore already scrolled past its
    // heading and filters.
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 1200));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'See all' }).click();
    await expect(page).toHaveURL(/\/explore/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a query-string change does NOT scroll the page', async ({ page }) => {
    // Explore rewrites `?q=` and `?category=` in place. Resetting the scroll
    // on the whole location rather than on the pathname would yank the page
    // to the top on every keystroke.
    //
    // ⚠️ THE VIEWPORT IS DELIBERATELY SHORT. Filtering to one category leaves
    // three cards, and at 720px tall that page is exactly one screen — the
    // browser clamps the offset to 0 because there is nothing left to scroll,
    // and the assertion fails against a page that is behaving correctly. At
    // 400px tall the filtered page still overflows, so the offset surviving
    // means something.
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto('/explore');
    await page.evaluate(() => window.scrollTo(0, 150));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBe(150);

    // ⚠️ `el.click()`, NOT `locator.click()`. Playwright scrolls a target into
    // view before pressing it, and the category chips sit at the top of the
    // page — so the harness itself moves the scroll offset to 0 and the
    // assertion measures Playwright rather than the app. Dispatching the
    // click on the element leaves the viewport where it is.
    await page
      .getByTestId('category-games')
      .evaluate((el: HTMLElement) => el.click());
    await expect(page).toHaveURL(/category=games/);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
