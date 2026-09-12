import { test, expect } from '@playwright/test';
import { stubRegistry } from './fixtures';

/**
 * The rail collapses to a drawer under `md`. Worth its own file because the
 * desktop project never renders this path at all — a sidebar that works on a
 * laptop and traps you on a phone would pass every other spec here.
 */
test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test('the rail is hidden and reachable through the menu', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('sidebar')).toBeHidden();
  await expect(page.getByTestId('sidebar-drawer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByTestId('sidebar-drawer')).toBeVisible();
});

test('navigating closes the drawer', async ({ page }) => {
  // Without this the overlay stays over the page you just asked for, which
  // reads as a frozen app.
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  // Scoped to the drawer: the desktop rail is `hidden md:block`, so it is
  // display:none but still in the DOM carrying the same test ids. An unscoped
  // locator matches twice and fails strictness.
  const drawer = page.getByTestId('sidebar-drawer');
  await drawer.getByTestId('nav-explore').click();

  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByTestId('sidebar-drawer')).toHaveCount(0);
});

test('search from the drawer closes it and filters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page
    .getByTestId('sidebar-drawer')
    .getByTestId('global-search')
    .fill('chat');

  await expect(page).toHaveURL(/[?&]q=chat/);
  await expect(page.getByTestId('sidebar-drawer')).toHaveCount(0);
  await expect(page.getByTestId('app-card')).toHaveCount(1);
});

test('the page does not scroll sideways at phone width', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByTestId('app-card').first()).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflows).toBe(false);
});

test('the drawer slides in from off-screen, and back out again', async ({
  page,
}) => {
  // ⚠️ IT USED TO MOUNT AT ITS FINAL POSITION. `{mobileOpen && <aside/>}` can
  // only appear and disappear, so the menu popped into place at full size with
  // no sense of where it came from, and closing it removed it between two
  // frames. A boolean cannot animate an unmount, which is why the state is
  // `closed | open | closing`.
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();

  const drawer = page.getByTestId('sidebar-drawer');
  await expect(drawer).toBeVisible();

  // Where it ends up: flush against the left edge.
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.x))
    .toBe(0);

  // Where it started, read off the animation itself rather than by racing it:
  // a finished `fill: both` animation is still on the element, so its first
  // frame can be asked for at any point after the fact.
  const startX = await page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="sidebar-drawer"]'
    ) as HTMLElement;
    const [animation] = el.getAnimations();
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 0;
    return el.getBoundingClientRect().x;
  });
  expect(startX, 'the drawer does not animate at all').not.toBeNull();
  expect(startX!).toBeLessThanOrEqual(-200);

  // And on the way out it slides rather than vanishing. Recorded by an
  // observer installed BEFORE the click: the exit lasts 200ms, which is
  // plenty for a person and not something to race a round trip against.
  await page.evaluate(() => {
    (window as unknown as { __classes: string[] }).__classes = [];
    new MutationObserver(() => {
      const el = document.querySelector('[data-testid="sidebar-drawer"]');
      if (el) {
        (window as unknown as { __classes: string[] }).__classes.push(
          el.className
        );
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });

  await page.getByRole('button', { name: 'Close menu' }).first().click();
  await expect(drawer).toHaveCount(0);

  const seen = await page.evaluate(
    () => (window as unknown as { __classes: string[] }).__classes
  );
  expect(
    seen.some(c => c.includes('animate-drawer-out')),
    'the drawer was removed without playing its exit'
  ).toBe(true);
});

test('the drawer wears the same lockup as the bar it opens from', async ({
  page,
}) => {
  // The drawer reuses the desktop rail, so opening the menu swapped the bar's
  // 18px compact mark for the rail's 22px one — the logo grew as it slid in,
  // over the header it was covering.
  await page.goto('/');
  const bar = page.locator('header [data-testid="registry-mark"] img');
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;

  await page.getByRole('button', { name: 'Open menu' }).click();
  const inDrawer = page.locator(
    '[data-testid="sidebar-drawer"] [data-testid="registry-mark"] img'
  );
  await expect(inDrawer).toBeVisible();
  // ⚠️ AFTER THE SLIDE, NOT DURING IT. `toBeVisible` is satisfied by an
  // element that is still off-screen, so measuring here without waiting reads
  // a coordinate from the middle of the entrance animation.
  await expect
    .poll(async () =>
      Math.round((await page.getByTestId('sidebar-drawer').boundingBox())!.x)
    )
    .toBe(0);
  const drawerBox = (await inDrawer.boundingBox())!;

  expect(Math.abs(drawerBox.height - barBox.height)).toBeLessThanOrEqual(0.5);
  // Same left edge and roughly the same baseline, so nothing shifts under the
  // one that is being covered.
  expect(Math.abs(drawerBox.x - barBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(drawerBox.y - barBox.y)).toBeLessThanOrEqual(2);
});
