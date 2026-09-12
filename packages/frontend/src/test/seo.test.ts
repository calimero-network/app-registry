import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clampDescription,
  formatTitle,
  DEFAULT_TITLE,
  SITE_NAME,
} from '@/lib/seo';

/**
 * What a crawler and an unfurler get.
 *
 * ⚠️ THE STATIC TAGS ARE THE WHOLE PREVIEW, AND NO TEST IN A BROWSER CAN
 * CATCH A MISTAKE IN THEM. This is a client-rendered SPA behind a catch-all
 * rewrite: Slack, iMessage, X, LinkedIn and Discord fetch `index.html` and
 * never run the bundle, so whatever is in that file is the card for every URL
 * on the origin — and an e2e assertion, which runs in a browser that HAS
 * executed the bundle, would pass on tags the scrapers never see.
 *
 * So the head is read off disk. The three properties below are the ones that
 * silently produce a blank card:
 *
 *   - a relative `og:image`, which most scrapers drop outright
 *   - an SVG `og:image`, which every one of them refuses to render
 *   - a missing `og:image:width`/`height`, which makes Slack lay the card out
 *     as a thumbnail until it has fetched and measured the file itself
 */
const INDEX_HTML = new URL('../../index.html', import.meta.url).pathname;

function meta(html: string, key: string) {
  const match = html.match(
    new RegExp(
      `<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"|` +
        `<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="${key}"`,
      'i'
    )
  );
  return match ? (match[1] ?? match[2]) : null;
}

describe('the document head', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('carries a title and a description', () => {
    expect(html).toMatch(/<title>[^<]{20,70}<\/title>/);
    expect(meta(html, 'description')?.length).toBeGreaterThan(60);
  });

  it('points link previews at an absolute PNG of a known size', () => {
    const image = meta(html, 'og:image');
    expect(image).toMatch(/^https:\/\//);
    expect(image).toMatch(/\.png$/);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    // Without this X renders the small square card, which crops the wordmark.
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'twitter:image')).toBe(image);
  });

  it('declares a canonical origin and lets itself be indexed', () => {
    expect(html).toContain('<link rel="canonical" href="https://');
    expect(meta(html, 'robots')).toContain('index');
    expect(meta(html, 'og:type')).toBe('website');
    expect(meta(html, 'og:site_name')).toBe(SITE_NAME);
  });

  it('describes the site in JSON-LD that parses', () => {
    const block = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block![1]);
    expect(
      parsed['@graph'].map((n: { '@type': string }) => n['@type'])
    ).toEqual(['WebSite', 'Organization']);
  });
});

describe('per-route titles', () => {
  it('puts the page first and the site second', () => {
    expect(formatTitle('Explore apps')).toBe(`Explore apps · ${SITE_NAME}`);
  });

  it('falls back to the site title at the root', () => {
    expect(formatTitle()).toBe(DEFAULT_TITLE);
    expect(formatTitle(null)).toBe(DEFAULT_TITLE);
  });
});

describe('description clamping', () => {
  it('leaves a short description alone', () => {
    expect(clampDescription('A spreadsheet that syncs between peers.')).toBe(
      'A spreadsheet that syncs between peers.'
    );
  });

  it('collapses the whitespace a publisher pasted in', () => {
    expect(clampDescription('two\n\nlines   here')).toBe('two lines here');
  });

  it('cuts on a word, not mid-glyph', () => {
    const long = `${'alpha beta gamma delta '.repeat(20)}end`;
    const clamped = clampDescription(long);
    expect(clamped.length).toBeLessThanOrEqual(160);
    expect(clamped.endsWith('…')).toBe(true);
    // The ellipsis replaces a whole word rather than landing inside one.
    expect(clamped.slice(0, -1).trim().split(' ').pop()).toMatch(
      /^(alpha|beta|gamma|delta)$/
    );
  });

  it('still clamps a single unbroken string', () => {
    // No space to cut on: a publisher's 300-character package id, or a URL.
    const clamped = clampDescription('x'.repeat(400));
    expect(clamped.length).toBeLessThanOrEqual(160);
    expect(clamped.endsWith('…')).toBe(true);
  });
});
