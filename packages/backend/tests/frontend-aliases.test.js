/**
 * `frontendAliases`: the other URLs an app's frontend is served at.
 *
 * `cargo mero bundle` writes `frontend-aliases` from an app's Cargo.toml into
 * the manifest's top-level `frontendAliases`. A node's sign-in page trusts a
 * login callback to any of their origins, next to `links.frontend`'s, so an app
 * that moved domain keeps signing in from wherever it is still opened at the
 * old one. That makes them as security-relevant as `links.frontend`: the
 * registry refuses anything but http(s) URLs on publish and on edit, and serves
 * only the http(s) entries.
 */

const {
  frontendAliasProblems,
  linkProblems,
  validateBundleMetadata,
  safeFrontendAliases,
  MAX_FRONTEND_ALIASES,
} = require('../src/lib/metadata-policy');
const { createBundleSanitizers } = require('../src/lib/bundle-sanitize');

const { sanitizeBundle, sanitizeBundles } = createBundleSanitizers({
  get: async () => null,
});

const bundleWith = extra => ({
  package: 'com.example.app',
  appVersion: '1.0.0',
  metadata: { name: 'Example' },
  links: { frontend: 'https://chat.example' },
  ...extra,
});

describe('frontendAliasProblems', () => {
  it('accepts no aliases and a list of http(s) URLs', () => {
    expect(frontendAliasProblems(undefined)).toEqual([]);
    expect(frontendAliasProblems(null)).toEqual([]);
    expect(frontendAliasProblems([])).toEqual([]);
    expect(
      frontendAliasProblems([
        'https://old-chat.example',
        'http://localhost:5173/',
      ])
    ).toEqual([]);
  });

  it('refuses anything that is not a list', () => {
    expect(frontendAliasProblems('https://old.example')).toHaveLength(1);
    expect(frontendAliasProblems({ a: 'https://old.example' })).toHaveLength(1);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '//old.example',
    'old.example',
    'https://old .example',
    '',
    'https://',
    42,
    null,
  ])('refuses %p as an entry, naming its index', value => {
    const problems = frontendAliasProblems(['https://ok.example', value]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('frontendAliases[1]');
  });

  it('caps the list', () => {
    const many = Array.from(
      { length: MAX_FRONTEND_ALIASES + 1 },
      (_, i) => `https://a${i}.example`
    );
    expect(frontendAliasProblems(many)).toHaveLength(1);
    expect(frontendAliasProblems(many.slice(1))).toEqual([]);
  });

  it('is part of linkProblems, which every publish and edit path runs', () => {
    expect(
      linkProblems({ frontend: 'https://ok.example' }, ['javascript:x'])
    ).toHaveLength(1);
    expect(linkProblems(undefined, ['javascript:x'])).toHaveLength(1);
    expect(linkProblems('nope', ['javascript:x'])).toHaveLength(2);
  });

  it('blocks a grandfathered package too, like an unsafe link', () => {
    const policy = validateBundleMetadata(
      bundleWith({ frontendAliases: ['javascript:alert(1)'] }),
      { isNewPackage: false }
    );
    expect(policy.errors.join(' ')).toContain('frontendAliases[0]');
  });
});

describe('frontendAliases on the read path', () => {
  const ALIASES = ['https://old-chat.example', 'https://older-chat.example/'];

  it('reaches the wire from the single-bundle sanitizer', async () => {
    const out = await sanitizeBundle(bundleWith({ frontendAliases: ALIASES }));
    expect(JSON.parse(JSON.stringify(out)).frontendAliases).toEqual(ALIASES);
  });

  it('reaches the wire from the listing sanitizer', async () => {
    const [out] = await sanitizeBundles([
      {
        bundle: bundleWith({ frontendAliases: ALIASES }),
        packageName: 'com.example.app',
      },
    ]);
    expect(JSON.parse(JSON.stringify(out)).frontendAliases).toEqual(ALIASES);
  });

  it('serves only the http(s) entries of anything stored before the rule', async () => {
    const out = await sanitizeBundle(
      bundleWith({
        frontendAliases: ['javascript:alert(1)', 'https://old-chat.example'],
      })
    );
    expect(JSON.parse(JSON.stringify(out)).frontendAliases).toEqual([
      'https://old-chat.example',
    ]);

    const junk = await sanitizeBundle(
      bundleWith({ frontendAliases: 'https://old-chat.example' })
    );
    expect(JSON.parse(JSON.stringify(junk))).not.toHaveProperty(
      'frontendAliases'
    );
  });

  it('invents nothing for a bundle that declares none', async () => {
    const out = await sanitizeBundle(bundleWith({}));
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty(
      'frontendAliases'
    );
    expect(safeFrontendAliases(undefined)).toBeUndefined();
  });
});
