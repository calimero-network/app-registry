import { describe, it, expect } from 'vitest';
import { nodeBuildLabel } from '@/lib/utils';

/**
 * `nodeBuildLabel` turns a bundle's `buildInfo` — stamped by `cargo mero
 * bundle` from the resolved `calimero-sdk` dependency — into the string the
 * app page shows beside the bundle version, or `null` when the bundle does not
 * say which node it was built against.
 *
 * The null cases carry the weight here. Every bundle published before
 * cargo-mero began stamping `buildInfo` has none, so returning a placeholder
 * instead of null would put a version on the page that the bundle never
 * claimed — for most of the registry at once.
 */
describe('nodeBuildLabel', () => {
  it('reports the release for a git-tag build', () => {
    expect(
      nodeBuildLabel({
        sdkSource: 'git',
        sdkVersion: '0.11.0-rc.34',
        sdkRev: '6c6fb4ab4fe02500ab1262c643f52dcc6d6278bf',
      })
    ).toBe('0.11.0-rc.34');
  });

  it('prefers the release over the commit when both are present', () => {
    expect(nodeBuildLabel({ sdkVersion: '0.11.0', sdkRev: 'abc1234def' })).toBe(
      '0.11.0'
    );
  });

  it('falls back to a short commit when no release is named', () => {
    // A branch or rev dependency resolves to no tag. The commit still
    // identifies the build exactly, and seven characters is what a reader can
    // paste into `git show`.
    expect(
      nodeBuildLabel({ sdkSource: 'git', sdkRev: '6c6fb4ab4fe02500ab1262c64' })
    ).toBe('6c6fb4a');
  });

  it('returns null for a bundle published before the field existed', () => {
    expect(nodeBuildLabel(undefined)).toBeNull();
    expect(nodeBuildLabel(null)).toBeNull();
    expect(nodeBuildLabel({})).toBeNull();
  });

  it('returns null for a local path build, which names neither', () => {
    // cargo-mero stamps the source so the provenance is not silently missing,
    // but a path checkout carries core's `0.0.0` placeholder version and no
    // commit — so there is nothing truthful to put on the page.
    expect(nodeBuildLabel({ sdkSource: 'path' })).toBeNull();
  });

  it('treats blank strings as absent, not as a version', () => {
    // A blank would render as an empty card: a label with no value under it,
    // which reads as a rendering fault rather than as missing data.
    expect(nodeBuildLabel({ sdkVersion: '   ', sdkRev: '  ' })).toBeNull();
    expect(nodeBuildLabel({ sdkVersion: '  ', sdkRev: 'abc1234def' })).toBe(
      'abc1234'
    );
  });
});
