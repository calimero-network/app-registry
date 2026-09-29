import { test, expect, type Page, type Route } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

/**
 * Opening a preview full screen should not start a cold download.
 *
 * The strip shows thumbnails; the lightbox shows the original. These specs
 * count the requests for each ORIGINAL to prove it is fetched ahead of the
 * click (idle warm-up for the first few, hover for the rest), that the
 * lightbox then paints it from memory with no new request, and that an
 * original which is NOT ready yet is covered by its thumbnail rather than a
 * blank overlay.
 *
 * ⚠️ WHY THE CACHE IS IN MEMORY AND NOT THE HTTP CACHE: Playwright's routing
 * disables the browser's HTTP cache outright, and a pending asset is served
 * `private` anyway — so "no new request" here is only provable because
 * lib/imageCache holds the bytes itself. That is the behaviour under test.
 */

const PKG = BUNDLES[0].package;

// A real 1×1 PNG, so every <img> actually decodes and fires `load`.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const base = (id: string) =>
  `/api/v2/packages/${encodeURIComponent(PKG)}/assets/${id}/raw`;

const IDS = ['a1', 'a2', 'a3', 'a4', 'a5'];

/**
 * Stub the listing and the bytes. `hold` names originals whose request never
 * completes, to observe the lightbox before the full image arrives.
 */
async function stubAssets(page: Page, { hold = [] as string[] } = {}) {
  await stubRegistry(page);
  const fullHits = new Map<string, number>();
  const thumbHits = new Map<string, number>();

  await page.route(
    `**/api/v2/packages/${encodeURIComponent(PKG)}/assets`,
    route =>
      route.fulfill({
        json: {
          assets: IDS.map((id, i) => ({
            id,
            url: base(id),
            thumbUrl: `${base(id)}?variant=thumb`,
            alt: `shot ${i + 1}`,
            kind: 'image',
            order: i,
            width: 1600,
            height: 900,
          })),
          state: 'approved',
          pendingApproval: false,
        },
      })
  );

  await page.route('**/assets/*/raw**', async (route: Route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').at(-2)!;
    const thumb = url.searchParams.get('variant') === 'thumb';
    const hits = thumb ? thumbHits : fullHits;
    hits.set(id, (hits.get(id) ?? 0) + 1);
    if (!thumb && hold.includes(id)) return; // never answered
    return route.fulfill({
      status: 200,
      body: PNG,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  });

  return { fullHits, thumbHits };
}

test('the first originals are fetched in the background, before any click', async ({
  page,
}) => {
  const { fullHits } = await stubAssets(page);
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-open')).toHaveCount(IDS.length);

  // Idle warm-up: the first three, nobody touching anything.
  await expect
    .poll(() => ['a1', 'a2', 'a3'].map(id => fullHits.get(id) ?? 0))
    .toEqual([1, 1, 1]);
  // …and NOT the rest: eight originals on every page view is the cost the
  // thumbnails exist to avoid.
  expect(fullHits.get('a4') ?? 0).toBe(0);
  expect(fullHits.get('a5') ?? 0).toBe(0);
});

test('hovering a tile starts its original', async ({ page }) => {
  const { fullHits } = await stubAssets(page);
  await page.goto(`/apps/${PKG}`);
  const tiles = page.getByTestId('asset-open');
  await expect(tiles).toHaveCount(IDS.length);

  await tiles.nth(4).hover();
  await expect.poll(() => fullHits.get('a5') ?? 0).toBe(1);
});

test('opening a warmed original makes NO new request and paints at once', async ({
  page,
}) => {
  const { fullHits } = await stubAssets(page);
  await page.goto(`/apps/${PKG}`);
  await expect.poll(() => fullHits.get('a1') ?? 0).toBe(1);
  // Let the in-memory copy finish (fetch + decode), not just start.
  await page.waitForTimeout(300);

  await page.getByTestId('asset-open').first().click();
  const img = page.getByTestId('lightbox-image');
  await expect(img).toBeVisible();
  // Served from the object URL the preloader holds…
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect(img).toHaveAttribute('data-loaded', 'true');
  // …so there is no placeholder frame, and no second trip for the bytes.
  await expect(page.getByTestId('lightbox-placeholder')).toHaveCount(0);
  expect(fullHits.get('a1')).toBe(1);

  // Closing and reopening costs nothing either.
  await page.getByTestId('lightbox-close').click();
  await page.getByTestId('asset-open').first().click();
  await expect(page.getByTestId('lightbox-image')).toHaveAttribute(
    'src',
    /^blob:/
  );
  expect(fullHits.get('a1')).toBe(1);
});

test('an original still in flight is covered by its thumbnail, never blank', async ({
  page,
}) => {
  // a5 is outside the idle warm-up, and its original never arrives.
  const { thumbHits } = await stubAssets(page, { hold: ['a5'] });
  await page.goto(`/apps/${PKG}`);
  await expect.poll(() => thumbHits.get('a5') ?? 0).toBeGreaterThan(0);

  await page.getByTestId('asset-open').nth(4).click();
  const placeholder = page.getByTestId('lightbox-placeholder');
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toHaveAttribute(
    'src',
    `${base('a5')}?variant=thumb`
  );
  // The thumbnail actually decoded — the browser already had it from the strip.
  expect(
    await placeholder.evaluate(el => (el as HTMLImageElement).naturalWidth)
  ).toBeGreaterThan(0);
  // The full image is mounted, loading, and invisible under it.
  await expect(page.getByTestId('lightbox-image')).toHaveAttribute(
    'data-loaded',
    'false'
  );
});

test('the lightbox preloads its neighbours', async ({ page }) => {
  const { fullHits } = await stubAssets(page);
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-open')).toHaveCount(IDS.length);

  // Open the 4th via keyboard (no hover), then its neighbours a3 and a5 load.
  await page.getByTestId('asset-open').nth(3).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('lightbox')).toBeVisible();
  await expect.poll(() => fullHits.get('a5') ?? 0).toBe(1);
  await expect.poll(() => fullHits.get('a3') ?? 0).toBe(1);

  // Stepping to a5 is then instant, from memory.
  await page.getByTestId('lightbox-next').click();
  await expect(page.getByTestId('lightbox-image')).toHaveAttribute(
    'src',
    /^blob:/
  );
  expect(fullHits.get('a5')).toBe(1);
});
