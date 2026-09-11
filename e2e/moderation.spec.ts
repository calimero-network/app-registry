import { test, expect, type Page } from '@playwright/test';
import { stubRegistry, BUNDLES } from './fixtures';

/**
 * Verification, the review queue, and the preview editor.
 *
 * ⚠️ THE POINT OF THE `verified` SPLIT. It used to be one field that was true
 * when EITHER an admin had approved the package OR the owner's email ended in
 * `@calimero.network`. Every live publisher is on that domain, so all 21
 * bundles were verified, the badge said nothing, and "show verified apps only"
 * would have hidden nothing. There are two claims now and they are
 * independent: a package can be verified whoever published it, and a verified
 * publisher's new package is not.
 */

const PKG = BUNDLES[0].package;

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function signedInAs(
  page: Page,
  user: { username?: string; email: string; isAdmin?: boolean }
) {
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
}

test.beforeEach(async ({ page }) => {
  await stubRegistry(page);
});

test.describe('the two badges', () => {
  test('a verified publisher does NOT make the package verified', async ({
    page,
  }) => {
    await page.route('**/api/v2/bundles**', route =>
      route.fulfill({
        json: BUNDLES.map(b => ({
          ...b,
          verified: false,
          publisherVerified: true,
        })),
      })
    );
    // ⚠️ `?unverified=1` IS LOAD-BEARING HERE. The listing defaults to
    // verified packages only, and the whole point of this fixture is a
    // package that is NOT verified — without the opt-out there is no card to
    // inspect and the spec fails on a listing that is behaving correctly.
    await page.goto('/explore?unverified=1');
    const card = page.getByTestId('app-card').first();
    await expect(card).toBeVisible();

    await expect(card.getByLabel('Verified author')).toBeVisible();
    await expect(card.getByLabel('Verified package')).toHaveCount(0);
  });

  test('a verified package by an unverified publisher shows the package mark', async ({
    page,
  }) => {
    await page.route('**/api/v2/bundles**', route =>
      route.fulfill({
        json: BUNDLES.map(b => ({
          ...b,
          verified: true,
          publisherVerified: false,
        })),
      })
    );
    await page.goto('/explore');
    const card = page.getByTestId('app-card').first();
    await expect(card.getByLabel('Verified package')).toBeVisible();
    await expect(card.getByLabel('Verified author')).toHaveCount(0);
  });
});

test.describe('the admin review queue', () => {
  const QUEUE = [
    {
      package: PKG,
      latestVersion: '0.0.13',
      metadata: { name: 'Mero Sheets', description: 'A spreadsheet.' },
      author: 'calimero-network',
      state: 'pending',
      decidedAt: null,
      decidedBy: null,
      reason: '',
      newestAssetAt: '2026-09-11T10:00:00.000Z',
      assets: [
        {
          id: 'a1',
          kind: 'image',
          contentType: 'image/png',
          bytes: 120,
          alt: 'the grid',
          order: 0,
          uploadedAt: '2026-09-11T10:00:00.000Z',
          url: `data:image/png;base64,${PNG}`,
        },
      ],
    },
  ];

  test.beforeEach(async ({ page }) => {
    await signedInAs(page, {
      username: 'admin',
      email: 'admin@calimero.network',
      isAdmin: true,
    });
  });

  test('shows what is waiting, with the images', async ({ page }) => {
    await page.route('**/api/admin/review-queue**', route =>
      route.fulfill({ json: { queue: QUEUE, count: 1 } })
    );
    await page.goto('/admin');
    await expect(page.getByTestId('review-card')).toHaveCount(1);
    // ⚠️ The image itself, not a filename. A decision about pictures taken
    // without seeing them is not a review.
    await expect(page.getByTestId('review-asset')).toBeVisible();
    await expect(page.getByTestId('review-state')).toContainText('pending');
  });

  test('approving posts the decision', async ({ page }) => {
    await page.route('**/api/admin/review-queue**', route =>
      route.fulfill({ json: { queue: QUEUE, count: 1 } })
    );
    const posted: Record<string, unknown>[] = [];
    await page.route('**/api/admin/packages/**', route => {
      posted.push(route.request().postDataJSON());
      route.fulfill({ json: { ok: true, state: 'approved' } });
    });

    await page.goto('/admin');
    await page.getByTestId('review-approve').click();
    await expect.poll(() => posted.length).toBeGreaterThan(0);
    expect(posted[0].action).toBe('approve');
  });

  test('declining REQUIRES a reason', async ({ page }) => {
    // ⚠️ The reason is not an internal note — it is the only thing that tells
    // the publisher why their images are hidden and what to change.
    await page.route('**/api/admin/review-queue**', route =>
      route.fulfill({ json: { queue: QUEUE, count: 1 } })
    );
    const posted: Record<string, unknown>[] = [];
    await page.route('**/api/admin/packages/**', route => {
      posted.push(route.request().postDataJSON());
      route.fulfill({ json: { ok: true, state: 'declined' } });
    });

    await page.goto('/admin');
    await expect(page.getByTestId('review-decline')).toBeDisabled();

    await page.getByTestId('review-reason').fill('Third-party logo.');
    await expect(page.getByTestId('review-decline')).toBeEnabled();
    await page.getByTestId('review-decline').click();

    await expect.poll(() => posted.length).toBeGreaterThan(0);
    expect(posted[0].action).toBe('decline');
    expect(posted[0].reason).toBe('Third-party logo.');
  });

  test('an empty queue says so rather than rendering nothing', async ({
    page,
  }) => {
    await page.route('**/api/admin/review-queue**', route =>
      route.fulfill({ json: { queue: [], count: 0 } })
    );
    await page.goto('/admin');
    await expect(page.getByTestId('review-empty')).toBeVisible();
  });

  test('a non-admin cannot reach the page at all', async ({ page }) => {
    await signedInAs(page, { username: 'someone', email: 'someone@x.com' });
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe('the preview editor', () => {
  const ASSETS = {
    assets: [
      {
        id: 'a1',
        kind: 'image',
        contentType: 'image/png',
        bytes: 100,
        alt: 'first',
        order: 0,
        url: `data:image/png;base64,${PNG}`,
      },
      {
        id: 'a2',
        kind: 'image',
        contentType: 'image/png',
        bytes: 100,
        alt: 'second',
        order: 1,
        url: `data:image/png;base64,${PNG}`,
      },
    ],
    state: 'approved',
    pendingApproval: false,
  };

  test.beforeEach(async ({ page }) => {
    await signedInAs(page, {
      username: 'calimero-network',
      email: 'owner@calimero.network',
    });
    await page.route('**/api/v2/packages/*/assets', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: ASSETS });
      }
      return route.fulfill({ json: { assets: ASSETS.assets } });
    });
  });

  test('reordering sends the WHOLE list, not just the moved one', async ({
    page,
  }) => {
    // ⚠️ The PATCH keeps anything omitted at the END of the order. A partial
    // request therefore silently reshuffles the rest, which is invisible
    // until someone looks at the card weeks later.
    let sent: { assets: { id: string }[] } | null = null;
    await page.route('**/api/v2/packages/*/assets', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: ASSETS });
      }
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { assets: ASSETS.assets } });
    });

    await page.goto(`/apps/${PKG}`);
    await page.getByLabel('Move later').first().click();

    await expect.poll(() => sent).not.toBeNull();
    expect(sent!.assets.map(a => a.id)).toEqual(['a2', 'a1']);
  });

  test('alt text saves on blur, not per keystroke', async ({ page }) => {
    // The PATCH rewrites the whole index; a request per character is a Redis
    // write per character.
    let calls = 0;
    await page.route('**/api/v2/packages/*/assets', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: ASSETS });
      }
      calls += 1;
      return route.fulfill({ json: { assets: ASSETS.assets } });
    });

    await page.goto(`/apps/${PKG}`);
    const alt = page.getByTestId('asset-alt').first();
    await alt.fill('a much better description');
    expect(calls).toBe(0);

    await alt.blur();
    await expect.poll(() => calls).toBe(1);
  });

  test('the first and last tiles cannot be moved off the ends', async ({
    page,
  }) => {
    await page.goto(`/apps/${PKG}`);
    await expect(page.getByLabel('Move earlier').first()).toBeDisabled();
    await expect(page.getByLabel('Move later').last()).toBeDisabled();
  });
});

test.describe('the verified-only listing', () => {
  // ⚠️ THE SHORTCUT IS WHAT MAKES THIS SWITCH THROWABLE. Defaulting to
  // verified-only was blocked for as long as nothing was verified: no live
  // bundle had been through a review, so turning it on hid all 21. Packages
  // from a `@calimero.network` publisher or the calimero-network org are
  // approved on arrival, so the default now hides exactly what it should —
  // unreviewed work by outside publishers.
  const MIXED = [
    { ...BUNDLES[0], verified: true, publisherVerified: true },
    {
      ...BUNDLES[1],
      package: 'com.outsider.thing',
      verified: false,
      publisherVerified: false,
      metadata: { ...BUNDLES[1].metadata, name: 'Outsider Thing' },
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v2/bundles**', route =>
      route.fulfill({ json: MIXED })
    );
  });

  test('hides an unreviewed package by default', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByTestId('app-card')).toContainText('Mero Sheets');
  });

  test('says how many it is holding back rather than silently dropping them', async ({
    page,
  }) => {
    // A listing that quietly drops rows leaves the reader wondering whether
    // something is broken.
    await page.goto('/explore');
    await expect(page.getByTestId('result-count')).toContainText(
      '1 awaiting review'
    );
  });

  test('the opt-out shows them, and lives in the URL', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('toggle-unverified').click();

    await expect(page).toHaveURL(/unverified=1/);
    await expect(page.getByTestId('app-card')).toHaveCount(2);

    // ⚠️ The URL carries the OPT-OUT, not the opt-in: a bare /explore always
    // means the reviewed listing, whoever shares the link.
    await page.goto('/explore');
    await expect(page.getByTestId('app-card')).toHaveCount(1);
  });
});
