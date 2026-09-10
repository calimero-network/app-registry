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
