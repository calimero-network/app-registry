import { test, expect } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

/**
 * Who gets the edit control on a package page.
 *
 * ⚠️ THE RULE LIVES ON THE SERVER, AND THE PAGE HAD ITS OWN. Every route that
 * edits a package — the metadata PATCH, the asset upload, delete, yank — asks
 * `canManagePackage`: the author, an admin or owner of the organization the
 * package belongs to, or a site admin. The page computed
 * `isOwner || isOrgMember` instead, which is wrong in BOTH directions: it
 * offered the controls to a plain org member, who gets a 403 the moment they
 * use them, and hid them from a site admin, who is allowed.
 *
 * These specs are about the second half, because that is the one nobody
 * notices: a missing control looks like a design decision.
 */

const PKG = BUNDLES[0].package;

/** Sign in as someone, with an optional org membership for this package. */
async function signedInAs(
  page: import('@playwright/test').Page,
  user: { username?: string; email: string; isAdmin?: boolean },
  org?: { members: { email: string; role: string }[] }
) {
  // ⚠️ `{ user }`, not the user. `/auth/me` answers with the user nested, and
  // a flat body makes `data.user` undefined — the context then reads it as
  // signed out, every permission is false, and the spec fails looking exactly
  // like the bug it is testing for.
  await page.route('**/api/auth/me**', route =>
    route.fulfill({
      json: {
        user: {
          id: user.email,
          name: user.username ?? null,
          picture: null,
          username: user.username ?? null,
          verified: true,
          ...user,
        },
      },
    })
  );
  if (org) {
    await page.route('**/api/v2/orgs/*/members**', route =>
      route.fulfill({ json: { members: org.members } })
    );
    await page.route('**/api/v2/packages/*/org**', route =>
      route.fulfill({ json: { id: 'org-1', name: 'Calimero' } })
    );
    await page.route('**/api/v2/orgs/by-package**', route =>
      route.fulfill({ json: { id: 'org-1', name: 'Calimero' } })
    );
  }
}

test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test('a signed-out visitor gets no edit control', async ({ page }) => {
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('app-preview')).toBeVisible();
  await expect(page.getByTestId('asset-edit')).toHaveCount(0);
});

test('a stranger gets no edit control', async ({ page }) => {
  await signedInAs(page, { username: 'nobody', email: 'nobody@example.com' });
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('app-preview')).toBeVisible();
  await expect(page.getByTestId('asset-edit')).toHaveCount(0);
});

test('the package author gets it', async ({ page }) => {
  // The fixture's author is `calimero-network`.
  await signedInAs(page, {
    username: 'calimero-network',
    email: 'owner@calimero.network',
  });
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-edit')).toBeVisible();
});

test('a SITE ADMIN gets it', async ({ page }) => {
  // ⚠️ The half that was broken. `canManagePackage` on the server ends in
  // `isAdmin(user.email)`, so an admin may edit any package — and the page
  // showed them nothing at all.
  await signedInAs(page, {
    username: 'sitead',
    email: 'admin@example.com',
    isAdmin: true,
  });
  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-edit')).toBeVisible();
});

test('the control opens a file picker rather than a dialog', async ({
  page,
}) => {
  // ⚠️ A <label> around a hidden file input, not a button that calls
  // `.click()` on one. Only a real gesture on the input may open the picker;
  // the indirection works today and is exactly what a stricter browser policy
  // takes away.
  await signedInAs(page, {
    username: 'calimero-network',
    email: 'owner@calimero.network',
  });
  await page.goto(`/apps/${PKG}`);

  const input = page.getByTestId('asset-input');
  await expect(input).toHaveAttribute('type', 'file');
  await expect(input).toHaveCount(1);
  // The visible control is the label for that input, so pressing it is a
  // genuine user gesture on the input itself.
  const labelFor = await page
    .getByTestId('asset-edit')
    .evaluate(el => el.tagName.toLowerCase());
  expect(labelFor).toBe('label');
});
