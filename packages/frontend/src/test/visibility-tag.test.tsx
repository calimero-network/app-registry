import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisibilityTag } from '../components/VisibilityTag';
import { toAppSummary } from '../lib/api';

const html = (props: Parameters<typeof VisibilityTag>[0]) =>
  renderToStaticMarkup(<VisibilityTag {...props} />);

describe('VisibilityTag', () => {
  it('tags a private package', () => {
    expect(html({ visibility: 'private' })).toContain('Private');
  });

  it('renders nothing for a public package, or one with no visibility', () => {
    expect(html({ visibility: 'public' })).toBe('');
    expect(html({})).toBe('');
  });

  it('shows a pending request to go public beside the private tag', () => {
    const out = html({ visibility: 'private', pendingPublic: true });
    expect(out).toContain('Private');
    expect(out).toContain('Public: pending review');
  });

  it('ignores a pending request on a package that is not private', () => {
    expect(html({ visibility: 'public', pendingPublic: true })).toBe('');
  });
});

describe('toAppSummary visibility', () => {
  const base = { package: 'com.example.app', appVersion: '1.0.0' };

  it('carries a private listing entry through', () => {
    expect(toAppSummary({ ...base, visibility: 'private' }).visibility).toBe(
      'private'
    );
  });

  it('leaves a public entry, which carries no field, unmarked', () => {
    expect(toAppSummary(base).visibility).toBeUndefined();
  });
});
