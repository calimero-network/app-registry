import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The accent token used for the wrong job.
 *
 * `brand-600` is accent TEXT and it FLIPS with the theme by design: the lime
 * on a dark ground, a deep green (#487800) on paper. `brand-accent` is the
 * fill, a literal #a5ff11 that is the same in both themes.
 *
 * Using the text token as an opaque background produced a lime button with
 * black text in dark mode and a deep-green button with black text in light
 * mode — about 1.3:1, illegible — which is what "Create organization" and the
 * org member buttons looked like.
 *
 * ⚠️ WHY THIS IS A SOURCE SCAN AND NOT A BROWSER TEST. Every button that had
 * the bug is behind a session: My organizations, an org's detail page, the
 * upload form. The e2e suite stubs the API but has no signed-in user, so it
 * cannot reach any of them — a computed-style assertion would only ever cover
 * the one public primary button, which never had the bug. A scan covers the
 * pages a browser test cannot get to.
 *
 * It deliberately looks for the PAIRING rather than banning `bg-brand-600`
 * outright: an opaque accent-text background with fixed dark ink on it is
 * always wrong, while a small decorative bar in the themed accent is fine and
 * in light mode is the better colour (see the rule under a docs heading — the
 * lime would be invisible there).
 */

const SRC = new URL('..', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

/**
 * `bg-brand-600` with no opacity modifier. A translucent tint
 * (`bg-brand-600/10`) is a different thing entirely: it is a wash over the
 * page's own ground, it stays legible in both themes, and it is used
 * deliberately in about a dozen places.
 */
const OPAQUE_ACCENT_BG = /\bbg-brand-600(?![/\w-])/;
/** Ink that does NOT follow the theme, so it cannot adapt to the flip. */
const FIXED_DARK_INK = /\btext-(black|neutral-950)\b/;

describe('the accent fill token', () => {
  const files = walk(SRC).filter(f => !f.includes('/test/'));

  it('is never the themed text token behind fixed dark ink', () => {
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OPAQUE_ACCENT_BG.test(line) && FIXED_DARK_INK.test(line)) {
            offenders.push(`${file.replace(SRC, 'src/')}:${i + 1}`);
          }
        });
    }

    expect(
      offenders,
      `Use bg-brand-accent (a fixed #a5ff11) for a solid control, not ` +
        `bg-brand-600, which is the accent TEXT token and turns into a deep ` +
        `green on a light ground — with text-black on it that is ~1.3:1.`
    ).toEqual([]);
  });

  it('still allows a translucent accent tint, which is theme-safe', () => {
    // Guards the guard: if the regex above ever started matching the tints,
    // it would be flagging ~12 correct call sites and someone would "fix"
    // them by removing colour that belongs there.
    expect(OPAQUE_ACCENT_BG.test('bg-brand-600/10 text-black')).toBe(false);
    expect(OPAQUE_ACCENT_BG.test('bg-brand-600/[0.08]')).toBe(false);
    expect(OPAQUE_ACCENT_BG.test('bg-brand-accent text-black')).toBe(false);
    // And that it does catch the real shape.
    expect(
      OPAQUE_ACCENT_BG.test('rounded-lg bg-brand-600 text-black px-4') &&
        FIXED_DARK_INK.test('rounded-lg bg-brand-600 text-black px-4')
    ).toBe(true);
  });
});
