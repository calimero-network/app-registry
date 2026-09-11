import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config.
 *
 * The suite runs the built frontend against a **stubbed** API — every spec
 * fulfils `/api/**` from a fixture. It must never touch the live registry:
 * these assertions are about counts, ordering and filter behaviour, so a suite
 * pointed at production would go red the moment somebody published an app,
 * and the failure would look like a UI regression.
 *
 * `vite preview` serves the production build rather than the dev server, so
 * what is tested is what ships — dev-only transforms and HMR overlays have
 * caused false passes elsewhere in this fleet.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    // `localhost`, not `127.0.0.1`: `vite preview` binds to the hostname,
    // which resolves to ::1 on macOS. Probing the IPv4 literal gets a
    // connection refused and the run dies as a 120s webServer timeout with no
    // hint as to why.
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Without this the desktop project also runs the mobile specs, which
      // assert the rail is hidden — it is not, at desktop width.
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      // The rail collapses to a drawer under `md`; that path has its own specs.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command:
      'pnpm --filter @calimero-network/registry-frontend preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
