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

/**
 * The accent used as INK, off the end of the themed ladder.
 *
 * Only two steps of `brand` follow the theme: `brand-600` (accent text) and
 * `brand-500` (its hover). Every other step is a literal hex — `brand-400` is
 * #c9ff73, `brand-300` #d6ff99, `brand-100` #ECFC91, `brand-accent` #a5ff11 —
 * which is exactly right for a FILL, where the ground under it is fixed too,
 * and wrong for text, where the ground flips from near-black to white.
 *
 * Measured on the profile menu, which is where this was reported:
 *
 *   | light mode        | rest    | hover       |
 *   |-------------------|---------|-------------|
 *   | Admin (before)    | 7.58:1  | **1.02:1**  |
 *   | My packages       | 13.87:1 | 16.53:1     |
 *
 * The admin row VANISHED under the cursor while the rows above it got more
 * legible. Dark mode measured 14.37 → 11.62 on the same markup, which is why
 * it went unnoticed.
 *
 * Four more call sites had the same misuse, and two of them were not hovers
 * at all — the admin panel's ACTIVE tab label (1.13:1 on the light page) and
 * the shield marking an admin in the users table (1.16:1 on a white card)
 * were unreadable in light mode at rest.
 *
 * ⚠️ A SOURCE SCAN, FOR THE SAME REASON AS THE RULE ABOVE: every one of these
 * is behind a session — the profile menu of a signed-in admin, the admin
 * panel, an organisation's detail page — and the e2e suite has no signed-in
 * user, so no computed-style assertion can reach any of them.
 */
const ACCENT_INK = /\btext-brand-([A-Za-z0-9-]+)/g;
/** The two steps that resolve through a custom property, and so flip. */
const THEMED_STEPS = new Set(['600', '500']);

describe('the accent as ink', () => {
  const files = walk(SRC).filter(f => !f.includes('/test/'));

  it('is only ever the two steps that follow the theme', () => {
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [match, step] of line.matchAll(ACCENT_INK)) {
            if (!THEMED_STEPS.has(step)) {
              offenders.push(`${file.replace(SRC, 'src/')}:${i + 1} ${match}`);
            }
          }
        });
    }

    expect(
      offenders,
      `Accent TEXT is brand-600, and brand-500 on hover. Every other brand ` +
        `step is a literal hex with no light-mode value: as ink on a white ` +
        `page they measure ~1.1:1. If the colour is a FILL, use ` +
        `bg-brand-accent with text-black.`
    ).toEqual([]);
  });

  it('knows which spellings it is talking about', () => {
    // Guards the guard, both ways.
    const offending = (line: string) =>
      [...line.matchAll(ACCENT_INK)].some(
        ([, step]) => !THEMED_STEPS.has(step)
      );

    expect(offending('text-brand-600 hover:text-brand-500')).toBe(false);
    expect(offending('text-brand-600/60')).toBe(false);
    expect(offending('bg-brand-accent text-black')).toBe(false);
    expect(offending('border-brand-900/40 hover:border-brand-700/50')).toBe(
      false
    );

    expect(offending('text-brand-500 hover:text-brand-400')).toBe(true);
    expect(offending('text-brand-accent')).toBe(true);
    expect(offending('border-brand-500 text-brand-400')).toBe(true);
  });
});
