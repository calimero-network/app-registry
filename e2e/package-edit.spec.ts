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

test('several picked images queue and upload ONE AT A TIME, in order', async ({
  page,
}) => {
  // ⚠️ Sequential is a correctness requirement, not a nicety: the server's
  // `addAsset` reads the index, appends, and writes it back, so two POSTs in
  // flight at once race and one row is silently lost.
  await signedInAs(page, {
    username: 'calimero-network',
    email: 'owner@calimero.network',
  });

  const stored: { id: string; alt: string }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const order: number[] = [];
  let release: (() => void) | null = null;

  await page.route(`**/api/v2/packages/*/assets`, async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const n = stored.length + 1;
      order.push(n);
      // Hold the first request so the queue is observable mid-run.
      if (n === 1) await new Promise<void>(r => (release = r));
      const asset = {
        id: `a${n}`,
        url: `/img/${n}.png`,
        thumbUrl: null,
        alt: '',
        kind: 'image',
        order: n - 1,
        width: 1,
        height: 1,
      };
      stored.push(asset);
      inFlight -= 1;
      return route.fulfill({ status: 201, json: { asset } });
    }
    return route.fulfill({
      json: {
        assets: stored.map((a, i) => ({
          ...a,
          url: `/img/${i + 1}.png`,
          thumbUrl: null,
          kind: 'image',
          order: i,
        })),
        state: 'pending',
        pendingApproval: true,
      },
    });
  });

  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-input')).toHaveAttribute('multiple', '');

  // A 1×1 PNG, so `prepareImage` has something real to decode.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  await page.getByTestId('asset-input').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: png },
    { name: 'two.png', mimeType: 'image/png', buffer: png },
    { name: 'three.png', mimeType: 'image/png', buffer: png },
  ]);

  // While the first is held: one uploading, two waiting, in a line.
  const items = page.getByTestId('upload-queue-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveAttribute('data-status', 'uploading');
  await expect(items.nth(1)).toHaveAttribute('data-status', 'queued');
  await expect(items.nth(2)).toHaveAttribute('data-status', 'queued');
  expect(maxInFlight).toBe(1);

  release!();

  await expect(page.getByTestId('upload-queue')).toHaveCount(0);
  await expect(page.getByTestId('asset-open')).toHaveCount(3);
  expect(order).toEqual([1, 2, 3]);
  expect(maxInFlight).toBe(1);
});

test('a pick larger than the free slots queues only what fits', async ({
  page,
}) => {
  await signedInAs(page, {
    username: 'calimero-network',
    email: 'owner@calimero.network',
  });
  // Six already stored: two slots left of eight.
  const existing = Array.from({ length: 6 }, (_, i) => ({
    id: `e${i}`,
    url: `/img/e${i}.png`,
    thumbUrl: null,
    alt: '',
    kind: 'image',
    order: i,
    width: 1,
    height: 1,
  }));
  let posts = 0;
  await page.route(`**/api/v2/packages/*/assets`, async route => {
    if (route.request().method() === 'POST') {
      posts += 1;
      // Never answer, so the queue stays on screen for the assertion.
      return new Promise(() => {});
    }
    return route.fulfill({
      json: { assets: existing, state: 'approved', pendingApproval: false },
    });
  });

  await page.goto(`/apps/${PKG}`);
  await expect(page.getByTestId('asset-open')).toHaveCount(6);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  await page.getByTestId('asset-input').setInputFiles(
    ['a', 'b', 'c', 'd'].map(n => ({
      name: `${n}.png`,
      mimeType: 'image/png',
      buffer: png,
    }))
  );
  await expect(page.getByTestId('upload-queue-item')).toHaveCount(2);
  expect(posts).toBeLessThanOrEqual(1);
});
