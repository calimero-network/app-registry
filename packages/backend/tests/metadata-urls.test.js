/**
 * Org/package metadata carries website/github/twitter fields that the frontend
 * renders as raw <a href> links. These lock in the server-side scheme check
 * that stops a stored `javascript:`/`data:` URL from ever reaching the DOM.
 */

const {
  isSafeHttpUrl,
  findUnsafeMetadataUrl,
  URL_METADATA_FIELDS,
} = require('@calimero-network/registry-shared/metadata-urls');

describe('metadata URL validation', () => {
  describe('isSafeHttpUrl', () => {
    it('accepts absolute http(s) URLs', () => {
      expect(isSafeHttpUrl('https://example.com')).toBe(true);
      expect(isSafeHttpUrl('http://example.com/path?q=1')).toBe(true);
    });

    it('accepts empty / undefined / null (optional fields)', () => {
      expect(isSafeHttpUrl('')).toBe(true);
      expect(isSafeHttpUrl('   ')).toBe(true);
      expect(isSafeHttpUrl(undefined)).toBe(true);
      expect(isSafeHttpUrl(null)).toBe(true);
    });

    it('rejects dangerous schemes', () => {
      expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false);
      expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(
        false
      );
      expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false);
    });

    it('rejects non-URL strings and non-strings', () => {
      expect(isSafeHttpUrl('not a url')).toBe(false);
      expect(isSafeHttpUrl(42)).toBe(false);
      expect(isSafeHttpUrl({})).toBe(false);
    });
  });

  describe('findUnsafeMetadataUrl', () => {
    it('returns null when every URL field is safe or absent', () => {
      expect(findUnsafeMetadataUrl({})).toBeNull();
      expect(findUnsafeMetadataUrl(null)).toBeNull();
      expect(
        findUnsafeMetadataUrl({
          description: 'javascript:not-a-url-field',
          website: 'https://example.com',
          github: '',
        })
      ).toBeNull();
    });

    it('returns the offending field name for a bad scheme', () => {
      expect(findUnsafeMetadataUrl({ website: 'javascript:alert(1)' })).toBe(
        'website'
      );
      expect(
        findUnsafeMetadataUrl({
          website: 'https://ok.com',
          twitter: 'data:text/html,x',
        })
      ).toBe('twitter');
    });

    it('only guards the known link fields', () => {
      expect(URL_METADATA_FIELDS).toEqual(['website', 'github', 'twitter']);
    });
  });
});
