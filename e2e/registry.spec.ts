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

  test('searches the description, not just the name', async ({ page }) => {
    await page.goto('/explore?q=geofencing');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByTestId('app-card')).toContainText('Mero Tag');
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
