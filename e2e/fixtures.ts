import type { Page } from '@playwright/test';

/**
 * A stand-in registry.
 *
 * Deliberately shaped like production rather than like a happy path. Of the
 * twenty bundles published today, three have no icon and every bundle that
 * predates the metadata policy has `installSize: null` and
 * `publishedAt: null` — so the fixture carries those too. A fixture where
 * every app is complete would let a card that renders "0 bytes" or
 * "Invalid Date" pass.
 *
 * It also mixes both category spellings: some bundles declare
 * `metadata.category`, others only carry a `tags` entry naming one, because
 * that is exactly the split in the registry until a cargo-mero release
 * carries the field.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const BUNDLES = [
  {
    package: 'com.calimero.mero-sheets',
    appVersion: '0.0.13',
    downloads: 340,
    verified: true,
    installSize: 1_258_291,
    publishedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    metadata: {
      name: 'Mero Sheets',
      author: 'calimero-network',
      description: 'A spreadsheet that syncs between peers with no server.',
      icon: PNG,
      category: 'productivity',
      tags: ['crdt', 'spreadsheet'],
    },
  },
  {
    package: 'com.calimero.battleships',
    appVersion: '0.0.7',
    downloads: 128,
    verified: true,
    installSize: 204_472,
    publishedAt: new Date(Date.now() - 9 * 864e5).toISOString(),
    metadata: {
      name: 'Battleships',
      author: 'calimero-network',
      description: 'Two-player Battleships with commit-reveal ship placement.',
      icon: PNG,
      // No `category`: only the singular `game` tag, which must still resolve.
      tags: ['game', 'multiplayer', 'turn-based'],
    },
  },
  {
    package: 'com.calimero.mero-chat',
    appVersion: '3.1.1',
    downloads: 981,
    verified: true,
    installSize: 890_112,
    publishedAt: new Date(Date.now() - 30 * 864e5).toISOString(),
    metadata: {
      name: 'Mero Chat',
      author: 'calimero-network',
      description: 'Encrypted group chat over Calimero namespaces.',
      icon: PNG,
      category: 'communication',
      tags: ['chat'],
    },
  },
  {
    // The awkward one: no icon, no size, no date. A third of production looks
    // like this, and it is the case most likely to render nonsense.
    package: 'com.calimero.mero-tag',
    appVersion: '0.0.5',
    downloads: 0,
    verified: true,
    installSize: null,
    publishedAt: null,
    metadata: {
      name: 'Mero Tag',
      author: 'calimero-network',
      description: 'Location tagging and geofencing.',
      tags: ['location', 'tracking'],
    },
  },
];

/**
 * Fulfil every API call the app makes, so no spec can reach the network.
 *
 * ORDER MATTERS AND IS COUNTER-INTUITIVE. Playwright matches routes in the
 * REVERSE of the order they were added, so the broadest pattern must be
 * registered FIRST or it shadows every specific one after it — the symptom is
 * a page that renders zero apps while the stub looks correct.
 */
export async function stubRegistry(page: Page, bundles = BUNDLES) {
  // Broadest first: anything unstubbed answers empty rather than hitting the
  // real registry.
  await page.route('**/api/**', route => route.fulfill({ json: {} }));

  // Anonymous, faithfully.
  //
  // `/auth/me` 401s as production does, which makes the client attempt a
  // refresh. The refresh response is load-bearing in a way that is easy to
  // miss: `refreshSession` treats a 401 as an EXPIRED session unless the body
  // says `no_refresh_token`, which is the only shape that means "this visitor
  // was never signed in". Any other 401 body — or the 200 the catch-all would
  // give — bounces every spec to /login?error=session_expired.
  await page.route('**/api/auth/refresh**', route =>
    route.fulfill({ status: 401, json: { error: 'no_refresh_token' } })
  );
  await page.route('**/api/auth/me**', route =>
    route.fulfill({ status: 401, json: { error: 'unauthenticated' } })
  );
  await page.route('**/api/stats**', route =>
    route.fulfill({
      json: {
        publishedApps: bundles.length,
        activeDevelopers: 1,
        publishedBundles: bundles.length,
        totalDownloads: 1449,
      },
    })
  );
  await page.route('**/api/v2/bundles**', route =>
    route.fulfill({ json: bundles })
  );
}
