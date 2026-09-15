// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sandboxFor } from '@/components/OpenAppTile';

/**
 * The "Try it out on web" tile showed a BLACK RECTANGLE for every published
 * app, and nothing in the product reported a fault.
 *
 * The frame was sandboxed without `allow-same-origin`. That flag does not
 * merely restrict a frame — without it the document is given an OPAQUE
 * origin, and on an opaque origin `localStorage` THROWS `SecurityError` on
 * read instead of returning null. Every Calimero frontend touches it while
 * booting, so each one threw before React's first render and left `#root`
 * empty; the body's dark background was the only thing left to see.
 *
 * Measured against all 18 published frontends at the time of the fix: 18
 * empty frames, one identical `SecurityError` each. With the flag: 18 render.
 *
 * ⚠️ WHY THIS IS A UNIT TEST AND NOT ONLY A BROWSER ONE. The browser test
 * (e2e/registry.spec.ts, "the framed app actually boots") proves the frame
 * runs, but it can only do so against a stub, because the real apps are third
 * parties that CI must not depend on. This test pins the security rule that
 * decides the attribute, which a stub on one fixed origin can never exercise
 * both sides of.
 *
 * THE RULE: `allow-scripts` + `allow-same-origin` is an escape only when the
 * framed document is same-origin WITH THE EMBEDDER — it can then reach into
 * this page and strip its own sandbox attribute. Cross-origin, the pair is
 * what an ordinary iframe has always had.
 */
describe('the preview frame sandbox', () => {
  const origin = () => window.location.origin;

  it('grants allow-same-origin to a cross-origin app, or it renders blank', () => {
    for (const url of [
      'https://mero-chat-pwa.vercel.app/',
      'https://battleships-fawn.vercel.app',
      'https://merraria.vercel.app/',
    ]) {
      expect(sandboxFor(url).split(' ')).toContain('allow-same-origin');
    }
  });

  it('keeps allow-scripts, or the framed app never runs at all', () => {
    expect(sandboxFor('https://mero-forum.vercel.app').split(' ')).toContain(
      'allow-scripts'
    );
  });

  // A different PORT and a different SCHEME are different origins, and both
  // are ordinary ways to host an app next to the registry.
  it('treats a different port or scheme as cross-origin', () => {
    const host = window.location.hostname;
    for (const url of [`https://${host}:8443/app`, `http://${host}/app`]) {
      if (new URL(url).origin === origin()) continue;
      expect(sandboxFor(url).split(' ')).toContain('allow-same-origin');
    }
  });

  // The one case the flag must be withheld: an app served from the registry's
  // OWN origin could use it to reach this document and unsandbox itself.
  it('withholds allow-same-origin from a same-origin frame', () => {
    for (const url of [
      `${origin()}/hosted/app`,
      '/hosted/app',
      'app/index.html',
    ]) {
      expect(sandboxFor(url).split(' ')).not.toContain('allow-same-origin');
    }
  });

  // A malformed `links.frontend` is publisher-supplied data. It must not
  // throw, and the strict sandbox is the safe answer to a URL we could not
  // classify.
  it('falls back to the strict sandbox for a URL it cannot parse', () => {
    for (const url of ['', 'ht!tp://%%%', 'javascript:alert(1)']) {
      const sandbox = sandboxFor(url);
      expect(sandbox).toContain('allow-scripts');
      expect(sandbox.split(' ')).not.toContain('allow-same-origin');
    }
  });
});
