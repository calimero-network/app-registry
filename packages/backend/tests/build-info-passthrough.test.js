/**
 * `buildInfo` passthrough.
 *
 * WHAT buildInfo IS. `cargo mero bundle` stamps the manifest with which node
 * release the WASM was compiled against, derived from the resolved
 * `calimero-sdk` dependency. It is a sibling of `metadata` (like `handlers`),
 * deliberately: nesting it inside `metadata` would move every app's raw-wasm
 * application id.
 *
 * WHY A TEST FOR CODE THAT DOES NOTHING. The registry carries this field for
 * free — `processPushBody` validates `package`/`appVersion`/signature and keeps
 * the rest, `storeBundleManifest` stores the manifest as-is, and both sanitizers
 * spread `...bundle`. Nothing names `buildInfo` anywhere in the backend, so
 * nothing *fails* if a future refactor starts projecting an explicit field list
 * instead — the field would just quietly stop reaching the page, and the UI,
 * which renders nothing when the field is absent, would look correct while
 * showing nothing.
 *
 * That is exactly the failure this repo already has a scar from: the CLI's push
 * payload was an explicit field list, and it silently dropped `handlers`.
 *
 * So: this file asserts the passthrough, not an implementation.
 */

const { createBundleSanitizers } = require('../src/lib/bundle-sanitize');

const { sanitizeBundle, sanitizeBundles } = createBundleSanitizers({
  get: async () => null,
});

/** A git-tag build, the shape every app in the `apps` monorepo produces. */
const BUILD_INFO = Object.freeze({
  sdkSource: 'git',
  sdkVersion: '0.11.0-rc.34',
  sdkRev: '6c6fb4ab4fe02500ab1262c643f52dcc6d6278bf',
});

const bundleWith = extra => ({
  package: 'com.example.app',
  appVersion: '1.0.0',
  metadata: { name: 'Example' },
  ...extra,
});

describe('buildInfo survives the read path', () => {
  it('reaches the wire from the single-bundle sanitizer', async () => {
    const out = await sanitizeBundle(bundleWith({ buildInfo: BUILD_INFO }));

    // JSON, not the in-memory object: that is what Fastify actually serialises.
    expect(JSON.parse(JSON.stringify(out)).buildInfo).toEqual(BUILD_INFO);
  });

  it('reaches the wire from the listing sanitizer', async () => {
    const [out] = await sanitizeBundles([
      {
        bundle: bundleWith({ buildInfo: BUILD_INFO }),
        packageName: 'com.example.app',
      },
    ]);

    expect(JSON.parse(JSON.stringify(out)).buildInfo).toEqual(BUILD_INFO);
  });

  it('carries a build that names no release, keeping the commit', async () => {
    // A branch or rev dependency resolves to no tag, so cargo-mero stamps the
    // commit and omits the version rather than inventing one. The registry must
    // not fill the gap either — the page shows the short SHA instead.
    const partial = { sdkSource: 'git', sdkRev: 'abc1234def' };

    const out = await sanitizeBundle(bundleWith({ buildInfo: partial }));

    expect(JSON.parse(JSON.stringify(out)).buildInfo).toEqual(partial);
  });

  it('invents nothing for a bundle published before the field existed', async () => {
    // Every bundle currently in the registry is one of these. A `buildInfo`
    // key appearing here — even as null — would be the registry asserting
    // provenance for a bundle that never claimed any.
    const out = await sanitizeBundle(bundleWith({}));

    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('buildInfo');
  });

  it('does not let buildInfo leak into metadata', async () => {
    // The whole reason it is a sibling: metadata feeds the display-metadata
    // JSON a node stores at install, and application ids derive from it.
    const out = await sanitizeBundle(bundleWith({ buildInfo: BUILD_INFO }));

    expect(out.metadata).not.toHaveProperty('buildInfo');
  });
});
