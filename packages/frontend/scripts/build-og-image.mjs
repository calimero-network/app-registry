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
 * The wordmark and the Power Grotesk faces are read from the app's own assets
 * rather than redrawn or fetched, and the colours are the dark theme's tokens
 * from index.css, so the card cannot drift from what the site shows.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'public/og.png');

const readB64 = rel => readFileSync(resolve(root, rel)).toString('base64');

const logoUrl = `data:image/svg+xml;base64,${readB64('src/assets/brand/calimero-wordmark.svg')}`;

// The site's own face, from the same files it self-hosts — inlined so the
// card cannot fall back to a system font while a request is in flight.
const face = (file, weight) => `@font-face {
  font-family: 'Power Grotesk';
  src: url(data:font/woff2;base64,${readB64(`public/fonts/powerGrotesk/${file}`)}) format('woff2');
  font-weight: ${weight};
}`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${face('PowerGrotesk-Black.woff2', 950)}
      ${face('PowerGrotesk-Bold.woff2', 700)}
      ${face('PowerGrotesk-Regular.woff2', 400)}
      ${face('PowerGrotesk-Light.woff2', 300)}

      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1200px;
        height: 630px;
        /* The dark theme's ground and ink (index.css). */
        background: #131215;
        font-family: 'Power Grotesk', system-ui, sans-serif;
        color: #fcfcfc;
        overflow: hidden;
        position: relative;
      }

      /* The page's faint column lines. */
      .grid { position: absolute; inset: 0 80px; display: flex; justify-content: space-between; }
      .grid i { width: 1px; background: rgba(252, 252, 252, 0.035); }

      /* The home hero's bloom (--hero-glow / --hero-glow-2). */
      .glow { position: absolute; border-radius: 50%; }
      .glow-a { top: -260px; right: -120px; width: 760px; height: 620px;
        background: radial-gradient(closest-side, rgba(165, 255, 17, 0.12), transparent); }
      .glow-b { bottom: -320px; right: 260px; width: 700px; height: 520px;
        background: radial-gradient(closest-side, rgba(109, 234, 173, 0.08), transparent); }

      .frame { position: relative; height: 100%; padding: 70px 80px; display: flex; flex-direction: column; }

      /* RegistryMark's lockup: the wordmark, a hairline, the product label. */
      .mark { display: flex; align-items: center; gap: 18px; }
      .mark img { height: 36px; display: block; }
      .mark span {
        border-left: 1px solid #404040;
        padding: 6px 0 6px 18px;
        font-weight: 400;
        font-size: 20px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: #a5ff11;
        line-height: 1;
      }

      .eyebrow {
        margin-top: auto;
        font-size: 18px;
        font-weight: 400;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: #a5ff11;
      }

      /* The landing's h1: uppercase, 950, tight. */
      h1 {
        margin-top: 18px;
        font-weight: 950;
        font-size: 74px;
        line-height: 1.02;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        color: #fcfcfc;
        /* Wide enough for two lines, breaking after "can" so the one lime
           word opens the second line instead of being split from it. */
        max-width: 1040px;
      }
      h1 em { font-style: normal; color: #a5ff11; }

      p {
        margin-top: 22px;
        font-size: 24px;
        font-weight: 300;
        line-height: 1.4;
        letter-spacing: 0.03em;
        color: #8e8e8e;
        max-width: 860px;
      }

      .foot { margin-top: 36px; display: flex; align-items: center; gap: 14px; }
      /* The site's tags: square, a hairline, small tracked capitals. */
      .tag {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #404040;
        padding: 10px 16px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #fcfcfc;
      }
      .tag b { color: #a5ff11; font-weight: 700; }
      .dot { width: 8px; height: 8px; background: #a5ff11; }
      .url { margin-left: auto; font-size: 17px; letter-spacing: 0.16em; text-transform: uppercase; color: #8e8e8e; }
    </style>
  </head>
  <body>
    <div class="grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="glow glow-a"></div>
    <div class="glow glow-b"></div>
    <div class="frame">
      <div class="mark">
        <img src="${logoUrl}" alt="Calimero" />
        <span>App Registry</span>
      </div>

      <div class="eyebrow">Signed apps for Calimero</div>
      <h1>Apps your node can <em>verify</em> for itself</h1>
      <p>
        Browse, publish and install signed application bundles. Every manifest is
        checked by the registry, then checked again by the node that installs it.
      </p>

      <div class="foot">
        <span class="tag"><span class="dot"></span>Signed <b>.mpk</b> bundles</span>
        <span class="tag">Open source · self-hostable</span>
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
// Without this the card can screenshot in the fallback face: the faces are
// decoded asynchronously even from a data: URL, and the metrics differ enough
// to reflow the headline.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();

console.log(`wrote ${out}`);
