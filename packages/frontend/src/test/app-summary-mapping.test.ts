/**
 * Bundle -> AppSummary mapping.
 *
 * The absent cases are not edge cases. Of the twenty bundles published today,
 * three have no icon, and `installSize` / `publishedAt` are null for every
 * bundle that predates the metadata policy — so roughly a third of the listing
 * takes these paths. A mapper that defaults them to `0` and `new Date(null)`
 * renders "0 bytes" and "Invalid Date" with total confidence.
 */

import { describe, it, expect } from 'vitest';
import { toAppSummary } from '../lib/api';

const bundle = (over: Record<string, unknown> = {}) => ({
  package: 'com.example.app',
  appVersion: '1.2.3',
  downloads: 7,
  verified: true,
  installSize: 204472,
  publishedAt: '2026-09-10T13:29:32.112Z',
  metadata: {
    name: 'Example',
    author: 'calimero-network',
    description: 'An example application.',
    icon: 'data:image/png;base64,iVBORw0KGgo=',
    tags: ['crdt', 'offline'],
    category: 'productivity',
  },
  ...over,
});

describe('toAppSummary', () => {
  it('carries every field the cards render', () => {
    const a = toAppSummary(bundle());
    expect(a).toMatchObject({
      id: 'com.example.app',
      name: 'Example',
      latest_version: '1.2.3',
      downloads: 7,
      verified: true,
      description: 'An example application.',
      category: 'productivity',
      installSize: 204472,
      publishedAt: '2026-09-10T13:29:32.112Z',
    });
    expect(a.icon).toMatch(/^data:image\/png;base64,/);
    expect(a.tags).toEqual(['crdt', 'offline']);
  });

  it('reports a missing size and date as null, never as zero or a bad date', () => {
    const a = toAppSummary(
      bundle({ installSize: undefined, publishedAt: undefined })
    );
    expect(a.installSize).toBeNull();
    expect(a.publishedAt).toBeNull();
    expect(a.installSize).not.toBe(0);
  });

  it('leaves a missing icon undefined so a fallback can render', () => {
    const b = bundle();
    delete (b.metadata as Record<string, unknown>).icon;
    expect(toAppSummary(b).icon).toBeUndefined();
  });

  it('resolves a category from tags when the bundle declares none', () => {
    // Every bundle published before cargo-mero carries `category` is in this
    // shape. Reading metadata.category alone would categorise nothing.
    const b = bundle();
    delete (b.metadata as Record<string, unknown>).category;
    (b.metadata as Record<string, unknown>).tags = ['multiplayer', 'games'];
    expect(toAppSummary(b).category).toBe('games');
  });

  it('maps the singular `game` tag onto the `games` category', () => {
    // Three live apps tag themselves `game`; the category is `games`.
    const b = bundle();
    delete (b.metadata as Record<string, unknown>).category;
    (b.metadata as Record<string, unknown>).tags = ['game'];
    expect(toAppSummary(b).category).toBe('games');
  });

  it('does not invent a category from an unrelated tag', () => {
    const b = bundle();
    delete (b.metadata as Record<string, unknown>).category;
    (b.metadata as Record<string, unknown>).tags = ['crdt', 'sandbox'];
    expect(toAppSummary(b).category).toBeUndefined();
  });

  it('survives a bundle with no metadata block at all', () => {
    const a = toAppSummary({
      package: 'com.example.bare',
      appVersion: '0.0.1',
    });
    expect(a.name).toBe('com.example.bare');
    expect(a.tags).toEqual([]);
    expect(a.icon).toBeUndefined();
    expect(a.installSize).toBeNull();
  });
});
