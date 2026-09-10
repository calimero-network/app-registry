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
  // With no stored choice the app follows the OS, and Playwright emulates a
  // LIGHT preference by default — so pin dark here, or "click the toggle and
  // expect light" is testing the wrong direction.
  test.use({ colorScheme: 'dark' });

  test('follows the OS when the visitor has expressed no preference', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the toggle flips the theme and survives a reload', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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

    const dark = await read();
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-text-rgb')
        .trim()
    );
    expect(accent).not.toBe('165 255 17');
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

  test('promos are links, not app cards', async ({ page }) => {
    // Rendering an outbound link as an AppCard would imply /apps/:id routing
    // and make a docs site look installable.
    await page.goto('/');
    const promos = page.getByTestId('promo-tile');
    await expect(promos).toHaveCount(2);
    await expect(promos.first()).toHaveAttribute('href', /calimero\.network/);
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
