import { test, expect } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

/**
 * What a phone gets that a laptop does not.
 *
 * Every one of these passed at desktop width while being wrong on a phone:
 * a caption box sized for a two-line wrap, a search box that only exists
 * inside a drawer, a 25,000px document with its table of contents hidden
 * below `lg`, and a call to action that only appears on hover. Width-agnostic
 * assertions cannot see any of them.
 */
test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test('the hero caption is not clipped by its box', async ({ page }) => {
  // ⚠️ THE BOX IS A FIXED HEIGHT WITH `overflow-hidden`, so a line too many
  // is cut through the middle of its glyphs rather than pushing the panel
  // open — it reads as a rendering fault. These sentences take two lines from
  // `sm` up and four at 360px.
  await page.goto('/');
  const fits = await page.evaluate(() => {
    const line = document.querySelector(
      '[data-testid="hero-caption"]'
    ) as HTMLElement;
    const box = line.parentElement as HTMLElement;
    return { line: line.scrollHeight, box: box.clientHeight };
  });
  expect(fits.line).toBeLessThanOrEqual(fits.box);
});

test('Explore carries its own search box', async ({ page }) => {
  // The rail's copy is behind a menu press at this width, which left the one
  // page whose job is searching the registry with no search on it.
  await page.goto('/explore');
  const search = page.getByTestId('explore-search');
  await expect(search).toBeVisible();

  await search.fill('chat');
  await expect(page).toHaveURL(/[?&]q=chat/);
  await expect(page.getByTestId('app-card')).toHaveCount(1);
});

test('the info grid stacks, and nothing in it is cut off', async ({ page }) => {
  // Two 168px cards at phone width left ~120px for the value, and the author
  // — the whole point of the card — was clipped mid-glyph. It is one column
  // here, and `truncate` sits on the text rather than on the flex row that
  // was ignoring it.
  // ⚠️ 360px, NOT THE PROJECT'S 412. The device profile is a Pixel 7, which
  // is wide enough that two columns still fit `calimero-network` — the test
  // passes against the broken markup at that width. 360 is the narrowest
  // width in common use (iPhone SE, Galaxy S-series), and it is where the
  // author was being cut in half.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/apps/${BUNDLES[0].package}`);
  const author = page
    .getByLabel('Author')
    .or(page.locator('.card', { hasText: 'Author' }));
  await expect(author.first()).toBeVisible();

  // Every box in the grid, not just the one being looked at: the same
  // truncation bug applies to whichever fact happens to be longest.
  const clipped = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="info-grid"]')!;
    return Array.from(grid.querySelectorAll('*'))
      .filter(el => (el as HTMLElement).offsetWidth > 0)
      .filter(el => el.scrollWidth > el.clientWidth + 1)
      .map(
        el => `${el.tagName.toLowerCase()}: ${el.textContent?.slice(0, 40)}`
      );
  });
  expect(clipped).toEqual([]);
});

test('no bundle renders the string "vundefined"', async ({ page }) => {
  // The manifest card interpolated `v${bundle.version}` unguarded, and a
  // bundle published before the manifest carried a version has none.
  await page.goto(`/apps/${BUNDLES[0].package}`);
  await expect(page.getByText('vundefined')).toHaveCount(0);
});

test('the docs page has a table of contents', async ({ page }) => {
  // The desktop one is `hidden lg:block`, over a document 25,000px tall.
  await page.goto('/docs');
  await expect(page.getByTestId('docs-toc')).toHaveCount(0);

  await page.getByTestId('docs-toc-toggle').click();
  const toc = page.getByTestId('docs-toc');
  await expect(toc).toBeVisible();
  await expect(toc.getByRole('link')).toHaveCount(10);

  await toc.getByRole('link', { name: 'Publishing', exact: true }).click();
  await expect(page).toHaveURL(/#publishing/);
  // It closes on the way out, or it covers the section it just jumped to.
  await expect(page.getByTestId('docs-toc')).toHaveCount(0);
});

test('the live preview says what it does without a hover', async ({ page }) => {
  // ⚠️ THERE IS NO HOVER ON A PHONE. The tile is a frame of someone else's
  // app with `pointer-events: none` over it, so a hover-only label left it as
  // a picture with nothing to say it opens anything.
  await page.route('**/api/v2/bundles**', route => {
    const pkg = new URL(route.request().url()).searchParams.get('package');
    route.fulfill({
      json: pkg ? BUNDLES.filter(b => b.package === pkg) : BUNDLES,
    });
  });
  await page.route('https://mero-chat.invalid/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<h1>framed</h1>' })
  );

  await page.goto('/apps/com.calimero.mero-chat');
  const cta = page.locator('.preview-cta');
  await cta.scrollIntoViewIfNeeded();
  // Opacity, not visibility: the element is always in the DOM and always
  // laid out — `@media (hover: none)` is what turns it on.
  await expect(cta).toHaveCSS('opacity', '1');
  await expect(page.getByText('View application on web')).toBeVisible();
});

test('nothing scrolls sideways on any page', async ({ page }) => {
  for (const url of [
    '/',
    '/explore',
    `/apps/${BUNDLES[0].package}`,
    '/developers',
    '/docs',
  ]) {
    await page.goto(url);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(over, `${url} scrolls sideways`).toBe(false);
  }
});
