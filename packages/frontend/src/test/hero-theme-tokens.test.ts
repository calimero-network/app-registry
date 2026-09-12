import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The hero laptop's greens, and why they are three tokens rather than one.
 *
 * `HeroGraphic` drew every green with `--accent` and every ink ON a green with
 * `--app-rail`. Both work in dark mode and neither works on paper:
 *
 *   - `--app-rail` is #0d1117 in dark and #f2f2f3 in light, so "Install", the
 *     tick, the send arrow and the text of your own chat bubbles went from
 *     near-black on lime to near-WHITE on lime — about 1.4:1. That is the
 *     "you can't even read what the messages say" in the third scene.
 *   - #a5ff11 is a fill colour, not an ink. At 0.10 (the selected row), 0.16
 *     (the active channel) and 0.22 (the install card's hairline) it is
 *     invisible on a light ground, and as type it measures ~1.2:1.
 *
 * So the greens are split by role — `--hero-accent` for a solid fill,
 * `--hero-accent-soft` for anything translucent or set as type, and
 * `--hero-on-accent` for ink on top of a fill — and in DARK mode all three
 * resolve to exactly what the graphic used before, which is what makes this a
 * light-mode fix rather than a redesign.
 *
 * ⚠️ A SOURCE SCAN, BECAUSE THE PIXELS CANNOT BE MEASURED. Every shape in
 * question is an SVG fill composited at an `opacity` the browser will not
 * report resolved; `getComputedStyle` gives back the token, not the colour on
 * screen. The ratios themselves are asserted in e2e against the tokens; what
 * is pinned here is that the graphic goes through them at all.
 */

const HERO = new URL('../components/HeroGraphic.tsx', import.meta.url).pathname;
const CSS = new URL('../index.css', import.meta.url).pathname;

const HERO_TOKENS = [
  '--hero-accent',
  '--hero-accent-soft',
  '--hero-on-accent',
] as const;

describe("the hero graphic's greens", () => {
  it('never reaches for the raw --accent', () => {
    const offenders = readFileSync(HERO, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /var\(--accent\)/.test(line))
      .map(({ n }) => `HeroGraphic.tsx:${n}`);

    expect(
      offenders,
      'Use --hero-accent for a solid fill and --hero-accent-soft for a ' +
        'translucent one or for type. --accent is the lime in BOTH themes, ' +
        'which is what made the washes and the channel name vanish on paper.'
    ).toEqual([]);
  });

  it('defines every hero token in both themes', () => {
    const css = readFileSync(CSS, 'utf8');
    // The light block is an override of the dark base; a token declared only
    // in the base silently keeps its dark value on paper, which is exactly
    // the failure mode being fixed.
    const light = css.slice(css.indexOf(":root[data-theme='light']"));
    const dark = css.slice(0, css.indexOf(":root[data-theme='light']"));

    for (const token of HERO_TOKENS) {
      expect(dark, `${token} missing from the dark base`).toContain(
        `${token}:`
      );
      expect(light, `${token} missing from the light override`).toContain(
        `${token}:`
      );
    }
  });

  it('keeps dark mode on exactly the values it already had', () => {
    // The point of the split is that it is invisible in dark mode: `soft` IS
    // the lime there and `on-accent` IS the dark rail. If either drifts, this
    // stops being a light-mode fix.
    const css = readFileSync(CSS, 'utf8');
    const dark = css.slice(0, css.indexOf(":root[data-theme='light']"));

    expect(dark).toMatch(/--hero-accent:\s*#a5ff11/i);
    expect(dark).toMatch(/--hero-accent-soft:\s*#a5ff11/i);
    expect(dark).toMatch(/--hero-on-accent:\s*#0d1117/i);
  });
});
