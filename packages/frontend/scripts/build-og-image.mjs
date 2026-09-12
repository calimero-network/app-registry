/**
 * Renders `public/og.png` — the card every link to this registry unfurls as.
 *
 * ⚠️ THE OUTPUT IS COMMITTED, AND THIS SCRIPT IS NOT PART OF THE BUILD. It
 * needs a browser, and putting Playwright in the deploy path to produce a file
 * that changes twice a year is a poor trade. Run it by hand when the card's
 * wording or the brand mark changes:
 *
 *   pnpm --filter @calimero-network/registry-frontend og
 *
 * ⚠️ IT IS A PNG, NOT THE SVG THE PAGE ITSELF WOULD USE. Slack, iMessage,
 * WhatsApp, LinkedIn and X all decline to render an SVG as `og:image` — a
 * vector card is a card nobody sees. 1200×630 is the size every one of them
 * crops from, and the safe area is the middle ~1080×510: X shows this at a
 * 2:1 ratio, so anything within ~60px of the top or bottom edge can be cut.
 *
 * The wordmark is read from the app's own asset rather than redrawn, and is
 * inverted to white the same way `--logo-filter` does it for the dark theme,
 * so the card cannot drift from what the site shows.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'public/og.png');

const logo = readFileSync(
  resolve(root, 'src/assets/calimero-logo.svg'),
  'utf8'
);
const logoUrl = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Sans:wght@500;700&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1200px;
        height: 630px;
        background: #0d1117;
        font-family: 'Inter', system-ui, sans-serif;
        color: #e6edf3;
        overflow: hidden;
        position: relative;
      }
      /* The page's own hero lighting: periwinkle, deliberately not the lime —
         green light behind green UI flattens the accent. */
      .lamp {
        position: absolute;
        border-radius: 999px;
        filter: blur(90px);
      }
      .lamp-a { top: -180px; left: 120px; width: 560px; height: 420px; background: rgba(129, 140, 248, 0.30); }
      .lamp-b { bottom: -220px; right: -60px; width: 560px; height: 460px; background: rgba(167, 139, 250, 0.22); }
      .lamp-c { bottom: -260px; left: 30%; width: 520px; height: 380px; background: rgba(165, 255, 17, 0.10); }

      .frame { position: relative; height: 100%; padding: 74px 80px; display: flex; flex-direction: column; }

      .mark { display: flex; flex-direction: column; align-items: flex-start; }
      .mark img { height: 40px; display: block; filter: brightness(0) invert(1); }
      /* The lockup from RegistryMark: the label is indented past the shield so
         it sits under the WORDMARK, and overlaps its baseline. */
      .mark span {
        margin-top: -6px;
        margin-left: 86px;
        font-family: 'Inter', system-ui, sans-serif;
        font-weight: 800;
        font-size: 20px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #a5ff11;
        line-height: 1;
      }

      h1 {
        margin-top: auto;
        font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
        font-weight: 700;
        font-size: 68px;
        line-height: 1.05;
        letter-spacing: -0.025em;
        color: #ffffff;
        /* Narrow enough to force the break after "can": left to a wider box
           the line lands on "verify for / itself.", which splits the phrase
           in the middle and buries the one green word at the end of a line. */
        max-width: 700px;
      }
      h1 em { font-style: normal; color: #a5ff11; }

      p {
        margin-top: 22px;
        font-size: 25px;
        font-weight: 400;
        line-height: 1.45;
        color: #9aa4b2;
        max-width: 830px;
      }

      .foot { margin-top: 44px; display: flex; align-items: center; gap: 16px; }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #2a323d;
        border-radius: 999px;
        padding: 11px 20px;
        font-size: 20px;
        color: #c9d1d9;
      }
      .pill b { color: #a5ff11; font-weight: 600; }
      .dot { width: 9px; height: 9px; border-radius: 999px; background: #a5ff11; }
      .url { font-size: 20px; color: #6e7681; letter-spacing: 0.01em; }
    </style>
  </head>
  <body>
    <div class="lamp lamp-a"></div>
    <div class="lamp lamp-b"></div>
    <div class="lamp lamp-c"></div>
    <div class="frame">
      <div class="mark">
        <img src="${logoUrl}" alt="Calimero" />
        <span>App Registry</span>
      </div>

      <h1>Apps your node can <em>verify</em> for itself.</h1>
      <p>
        Browse, publish and install signed application bundles. Every manifest is
        checked by the registry, then checked again by the peer that installs it.
      </p>

      <div class="foot">
        <span class="pill"><span class="dot"></span>Signed <b>.mpk</b> bundles</span>
        <span class="pill">Open source · self-hostable</span>
        <span class="url">apps.calimero.network</span>
      </div>
    </div>
  </body>
</html>`;

mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: 'load' });
// Without this the card screenshots in the fallback face: the webfont is still
// in flight when `load` fires, and the metrics differ enough to reflow the
// headline.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();

console.log(`wrote ${out}`);
