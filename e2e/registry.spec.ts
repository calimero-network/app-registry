import { test, expect } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test.describe('the header', () => {
  test('renders as a top bar and routes', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByTestId('primary-nav');
    await expect(nav).toBeVisible();

    // Horizontal, at the top of the page: calimero.network's header, not a
    // rail. Asserting on the class would pass whatever the layout did, so
    // measure the box.
    const box = await nav.boundingBox();
    expect(box!.width).toBeGreaterThan(box!.height);
    expect(box!.y).toBeLessThan(10);

    await page.getByTestId('nav-explore').click();
    await expect(page).toHaveURL(/\/explore/);
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  });
});

test.describe('global search', () => {
  test('filters from the header and puts the term in the URL', async ({
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

  test('the sign-in button sits in the header, beside the one CTA', async ({
    page,
  }) => {
    await page.goto('/');
    const header = page.getByTestId('site-header');
    await expect(header.getByTestId('sign-in')).toBeVisible();
    await expect(header.getByTestId('nav-upload')).toHaveAttribute(
      'href',
      '/upload'
    );
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
  // ⚠️ THE OS PREFERENCE IS EMULATED AS LIGHT HERE ON PURPOSE. Dark — the
  // calimero.network charcoal — is the default whatever the desktop says, so
  // the suite asks for a light desktop to prove the OS is not consulted.
  test.use({ colorScheme: 'light' });

  test('opens in dark mode even on a light desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the first paint is dark, before any script runs', async ({ page }) => {
    // The attribute is in the served HTML, so the default never flashes the
    // other palette before the module runs. Read the markup rather than the
    // DOM, which would show whatever JavaScript did to it afterwards.
    const res = await page.request.get('/');
    expect(await res.text()).toContain('<html lang="en" data-theme="dark">');
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
    await page.evaluate(() => localStorage.setItem('registry:theme', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
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
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // And a stored choice still beats the default on a fresh load.
    await page.goto('/explore');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('light mode actually inverts the ground and the text', async ({
    page,
  }) => {
    // Asserting the attribute alone would pass even if no colour moved — the
    // whole risk here is a `data-theme` that flips while ~580 hardcoded
    // utilities stay dark. So compare rendered pixels.
    // ⚠️ THE TOGGLE LIVES ON THE HOME PAGE NOW, and the colours being measured
    // are on Explore — so the theme is flipped where the control is and the
    // pixels are read where the cards are. Clicking it here used to work
    // because it sat in the rail on every page.
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

    // Dark is where the app starts, so this reads dark first and toggles
    // INTO light; the comparison is the same either way.
    const dark = await read();

    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.goto('/explore');
    await expect(page.getByTestId('app-card').first()).toBeVisible();
    const light = await read();

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
    await page.addInitScript(() => {
      localStorage.setItem('registry:theme:choice', 'light');
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
        // ⚠️ TWO ELEMENTS, DELIBERATELY. The card's border and the header's
        // hairline come from different call sites. They were two different
        // tokens once, so a spec that read only the card passed while every
        // separator on the page was still invisible. They are one token now,
        // and this is what holds them to it.
        const rail = document.querySelector(
          '[data-testid="site-header"]'
        ) as HTMLElement;
        return {
          card: getComputedStyle(card).borderTopColor,
          rail: getComputedStyle(rail).borderBottomColor,
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

test.describe('the theme control', () => {
  test('is an icon on Home, and is NOT in the header', async ({ page }) => {
    // It used to sit in the navigation on every page, which gave a decision
    // made once the same standing as the links used every visit.
    await page.goto('/');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(
      page.getByTestId('site-header').getByTestId('theme-toggle')
    ).toHaveCount(0);

    // Icon only: the accessible name carries the meaning, not visible text.
    await expect(toggle).toHaveText('');
    await expect(toggle).toHaveAttribute('aria-label', /light|dark/i);

    await page.goto('/explore');
    await expect(page.getByTestId('theme-toggle')).toHaveCount(0);
  });

  test('the choice it sets still applies on every other page', async ({
    page,
  }) => {
    // Moving the control must not scope the theme to the page carrying it.
    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.goto('/docs');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('the accent as text', () => {
  test('the registry lockup clears AA against the header in light mode', async ({
    page,
  }) => {
    // The label is 8px, bold, uppercase and tracked — the least forgiving
    // text in the app — and it is painted in the same token as every link
    // and every inline code span. A ratio, not a class: the token moved
    // twice already and the markup never changed either time.
    await page.addInitScript(() => {
      localStorage.setItem('registry:theme:choice', 'light');
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const ratio = await page.evaluate(() => {
      const label = document
        .querySelector(
          '[data-testid="header-brand"] [data-testid="registry-mark"]'
        )!
        .querySelector('span:last-child') as HTMLElement;
      const rail = document.querySelector(
        '[data-testid="site-header"]'
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

test.describe("the hero laptop's greens", () => {
  /**
   * ⚠️ MEASURED ON THE TOKENS, NOT ON THE PIXELS. Every green in the hero is
   * an SVG fill composited at an `opacity` the browser will not report
   * resolved — `getComputedStyle` hands back `var(--hero-accent)`, not the
   * colour on screen — so a screenshot would be the only way to read the
   * literal pixel, and a screenshot cannot say WHY it is wrong. What decides
   * legibility is the pair of values behind the shapes, and both pairs are
   * asserted here in both themes.
   *
   * The graphic used `--accent` for every green and `--app-rail` for the ink
   * on top of one. In light mode that second token is #f2f2f3, so "Install",
   * the tick, the send arrow and the text of your own chat messages were
   * near-WHITE on lime.
   */
  /** Runs in the page: reads the tokens off :root and measures WCAG ratios. */
  const measure = () => {
    const cs = getComputedStyle(document.documentElement);
    const channels = (name: string) => {
      const hex = cs.getPropertyValue(name).trim().replace('#', '');
      const full =
        hex.length === 3
          ? hex
              .split('')
              .map(c => c + c)
              .join('')
          : hex;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    };
    const luminance = (name: string) => {
      const [r, g, b] = channels(name).map(v => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [la, lb] = [luminance(a), luminance(b)];
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    return {
      inkOnFill: ratio('--hero-on-accent', '--hero-accent'),
      typeOnScreen: ratio('--hero-accent-soft', '--app-rail'),
    };
  };

  for (const theme of ['light', 'dark'] as const) {
    test(`stay legible against each other in ${theme} mode`, async ({
      page,
    }) => {
      await page.goto('/');
      if (theme === 'light') await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const { inkOnFill, typeOnScreen } = await page.evaluate(measure);

      // "Install", the tick, the send arrow, and the text inside your own
      // chat bubbles — all ink sitting on a solid accent fill.
      expect(inkOnFill, 'ink on an accent fill').toBeGreaterThan(4.5);
      // The channel name, "installed to your node", the selected row's wash
      // and the composer caret — accent set as type or as a hairline, against
      // the screen the laptop is drawing.
      expect(typeOnScreen, 'accent type on the screen').toBeGreaterThan(4.5);
    });
  }
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
    //
    // ⚠️ THE STUB BOOTS THE WAY A REAL APP BOOTS, and that is the whole point
    // of it. It used to be `<h1>framed</h1>` — static markup, which renders
    // under ANY sandbox — so the suite was green through the entire period
    // every published app showed as a black rectangle here. A stub that does
    // not do the thing that broke is not coverage of it.
    //
    // So it reads `localStorage` first, exactly as the Calimero SDK does when
    // it looks for a session. On a frame without `allow-same-origin` the
    // origin is opaque and that read THROWS rather than returning null, which
    // is what killed every app before its first render.
    await page.route('https://mero-chat.invalid/**', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body style="margin:0;background:#0b0d12">
          <div id="root"></div>
          <script>
            // No try/catch: a throw here must leave #root empty, the same way
            // a real app's does.
            localStorage.getItem('calimero-session');
            document.getElementById('root').innerHTML =
              '<h1 data-testid="framed-app">framed</h1>';
          </script>
        </body></html>`,
      })
    );
  });

  test('the framed app actually boots, rather than painting its background and dying', async ({
    page,
  }) => {
    // ⚠️ THE TILE WAS A BLACK RECTANGLE FOR EVERY PUBLISHED APP, and every
    // guard in the component stayed quiet: the document DID load, so `onLoad`
    // ran, `loaded` went true, the 6s timeout was cleared, and the fallback
    // link never appeared. All 18 frontends, one identical `SecurityError`
    // each, from `localStorage` on the opaque origin a sandbox without
    // `allow-same-origin` imposes. The apps set a dark `body` background in
    // CSS, so what was left on screen was that colour and nothing else.
    //
    // ASSERTING ON THE FRAME'S CONTENT is what makes this a test of the bug.
    // The tile was visible, correctly sized and correctly animated throughout
    // — the sibling test below passed the whole time. Only what is INSIDE the
    // frame distinguishes a working preview from a coloured box.
    await page.goto('/apps/com.calimero.mero-chat');
    await expect(page.getByTestId('open-app')).toBeVisible();

    const frame = page.frameLocator('iframe.preview-frame');
    await expect(frame.getByTestId('framed-app')).toHaveText('framed');

    // And the flag is really the reason, not an incidental attribute: the
    // stub is on another origin, so it must be granted.
    await expect(page.locator('iframe.preview-frame')).toHaveAttribute(
      'sandbox',
      /allow-same-origin/
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
    // Polled, not read once: the URL changes when the history entry is
    // pushed, and the reset runs when React commits the new page, which can
    // be a frame or two later under a loaded runner.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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

test.describe('the upload page', () => {
  test('carries the form and the graphic, not a second set of instructions', async ({
    page,
  }) => {
    // ⚠️ THE WALKTHROUGH THAT WAS HERE CONTRADICTED THE DOCS. It taught
    // `mero-sign` and `calimero-registry bundle create` / `bundle push` — a
    // flow the docs page states outright is replaced by `cargo mero`. Two
    // sets of instructions where one is wrong is worse than one set, and the
    // docs already cover every command it mentioned.
    await page.goto('/upload');
    await expect(page.getByTestId('publish-art')).toBeVisible();

    const body = (await page.locator('main').innerText()).toLowerCase();
    expect(body).not.toContain('mero-sign');
    expect(body).not.toContain('calimero-registry bundle');
    expect(body).not.toContain('step by step');

    // And it points at the one place the instructions do live.
    await expect(
      page.getByRole('link', { name: 'The documentation' })
    ).toBeVisible();
  });

  test('the graphic animates without JavaScript', async ({ page }) => {
    // Same rule as the hero: a rAF loop runs forever in every background tab
    // and bypasses `prefers-reduced-motion`, which is honoured globally here
    // by a media query that can only reach declarative animation.
    await page.goto('/upload');
    const running = await page.evaluate(() => {
      const el = document.querySelector('.pa-bundle') as HTMLElement;
      return getComputedStyle(el).animationName;
    });
    expect(running).toBe('pa-lift');
  });
});

test.describe('the docs menu', () => {
  test('is one panel with a marked active row', async ({ page }) => {
    // It was ten unstyled links under a grey label with a pale wash for the
    // active one — nothing said it was a single thing or where you were.
    await page.goto('/docs');
    const first = page.getByTestId('docs-nav-introduction');
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('aria-current', 'true');

    // ⚠️ Marked by a RULE on the edge, not a tint: on white there is almost no
    // room between "visible" and "fighting the text", which is why the old
    // wash read as a smudge.
    const border = await first.evaluate(
      el => getComputedStyle(el).borderLeftColor
    );
    const ground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(border).not.toBe(ground);
    expect(border).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('one green in both themes', () => {
  /**
   * The complaint this encodes: a solid button was a different, muddier green
   * in light mode than in dark, and the upload page showed two different
   * greens touching each other.
   *
   * ⚠️ THE CAUSE WAS A TOKEN USED FOR THE WRONG JOB. `brand-600` is accent
   * TEXT and it flips with the theme by design (lime on a dark ground, a deep
   * green on paper); using it as a BACKGROUND therefore produced a lime
   * button with black text in dark mode and a #3f6a00 button with black text
   * in light mode, which measures about 1.3:1. Fills go through
   * `brand-accent`, a literal hex with no custom property behind it.
   *
   * A computed colour, not a class name: the class could be renamed and the
   * bug reintroduced under a different spelling, and the thing that actually
   * matters is that the two themes paint the same pixels.
   */
  const readButton = async (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const btn = document.querySelector('.btn-primary') as HTMLElement;
      const s = getComputedStyle(btn);
      return { background: s.backgroundColor, color: s.color };
    });

  test('a primary button is the same colour in light as in dark', async ({
    page,
  }) => {
    const seen: Record<string, { background: string; color: string }> = {};

    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript(t => {
        localStorage.setItem('registry:theme:choice', t as string);
      }, theme);
      // The 404 page carries a primary and a secondary button and needs no
      // session, which the upload page's own pair does.
      await page.goto('/no-such-page');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.btn-primary')).toBeVisible();
      seen[theme] = await readButton(page);
    }

    expect(seen.light).toEqual(seen.dark);
    // And specifically the lime, rather than the two themes having merely
    // agreed on some other colour.
    expect(seen.light.background).toBe('rgb(165, 255, 17)');
  });

  test('the accent fill keeps black ink on it, which is what makes it legible', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('registry:theme:choice', 'light');
    });
    await page.goto('/no-such-page');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const ratio = await page.evaluate(() => {
      const btn = document.querySelector('.btn-primary') as HTMLElement;
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
      const s = getComputedStyle(btn);
      const a = L(s.color);
      const b = L(s.backgroundColor);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    });

    // ~15.9:1. This is the reason the lime can be shared across both themes
    // as a fill when it cannot be shared as text.
    expect(ratio).toBeGreaterThan(10);
  });
});

test.describe('the warning amber', () => {
  /**
   * ⚠️ MEASURED ON THE TOKENS, FOR THE REASON THE HERO SPEC GIVES. Every
   * warning in the app is a low-alpha fill — `bg-amber-950/20`, `/30`,
   * `bg-amber-500/10` — and Tailwind 4 emits those as `color-mix()`, which
   * `getComputedStyle` does not hand back resolved. So the wash is composited
   * here from the tokens that produce it, which is also the thing that has to
   * stay true: the markup never changes, the tokens do.
   *
   * What this guards: amber used to be Tailwind's stock scale, picked for a
   * dark ground and never overridden. In light mode the "copy this token now
   * — it will not be shown again" banner in /orgs rendered amber-400 on a
   * #dad1cd wash at 1.11:1. It was the most important sentence on the page
   * and it was invisible.
   */
  const measure = () => {
    const cs = getComputedStyle(document.documentElement);
    const chan = (name: string) =>
      cs.getPropertyValue(name).trim().split(/\s+/).map(Number) as [
        number,
        number,
        number,
      ];
    const hex = (name: string) => {
      const h = cs.getPropertyValue(name).trim().replace('#', '');
      const full =
        h.length === 3
          ? h
              .split('')
              .map(c => c + c)
              .join('')
          : h;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
    };
    const over = (
      fg: [number, number, number],
      a: number,
      bg: [number, number, number]
    ) => fg.map((c, i) => c * a + bg[i] * (1 - a)) as [number, number, number];
    const L = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (
      fg: [number, number, number],
      bg: [number, number, number]
    ) => {
      const [la, lb] = [L(fg), L(bg)];
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    const card = hex('--surface');
    return {
      // /orgs: the fresh API token banner.
      tokenBanner: ratio(
        chan('--warn-400-rgb'),
        over(chan('--warn-950-rgb'), 0.2, card)
      ),
      // AppPreview: the unverified-publisher badge.
      unverifiedBadge: ratio(
        chan('--warn-300-rgb'),
        over(chan('--warn-950-rgb'), 0.3, card)
      ),
      // AppDetailPage: the yanked-version notice.
      yankedNotice: ratio(
        chan('--warn-400-rgb'),
        over(chan('--warn-900-rgb'), 0.2, card)
      ),
      // OrgDetailPage / ReviewQueue: the status pill, the tightest pair.
      statusPill: ratio(
        chan('--warn-500-rgb'),
        over(chan('--warn-500-rgb'), 0.1, card)
      ),
    };
  };

  for (const theme of ['light', 'dark'] as const) {
    test(`clears AA on its own wash in ${theme} mode`, async ({ page }) => {
      await page.goto('/');
      if (theme === 'light') await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const r = await page.evaluate(measure);

      // Small text on a tinted ground: AA is 4.5:1, not the 3:1 large type
      // would allow. The statusPill pair is the binding one at ~4.75:1 in
      // light mode — do not darken the wash or lighten the 500 ink further.
      expect(r.tokenBanner).toBeGreaterThan(4.5);
      expect(r.unverifiedBadge).toBeGreaterThan(4.5);
      expect(r.yankedNotice).toBeGreaterThan(4.5);
      expect(r.statusPill).toBeGreaterThan(4.5);
    });
  }
});
