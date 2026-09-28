/**
 * A verifier that cannot load (e.g. an ESM-only @noble/ed25519 that require()
 * refuses on an older Node) is a server fault. It must surface as
 * `verifier_unavailable`, never be swallowed into "Invalid signature" — that
 * turned every publish into a 400 bundle_integrity with no hint of the cause.
 */
const MANIFEST = {
  package: 'com.example.demo',
  appVersion: '1.0.0',
  signature: {
    algorithm: 'ed25519',
    publicKey: 'hp6BeiDHt5vg-Bk7-RlRMAovynWBRH_BX9i_UZ6hxag',
    signature:
      '7IQH3YnyywXCKZ_42UW9sznxyhKVU2mTA4o1dZIDRa-FBeE7VmzNncvsKWUNmwHukJThSBO5LBSs-GWmflMcCA',
  },
};

function withBrokenEd25519(fn, code = 'MODULE_NOT_FOUND') {
  return new Promise((resolve, reject) => {
    jest.isolateModules(() => {
      jest.doMock('@noble/ed25519', () => {
        const err = new Error('require() of @noble/ed25519 failed');
        err.code = code;
        throw err;
      });
      Promise.resolve(fn()).then(resolve, reject);
    });
  });
}

afterEach(() => {
  jest.dontMock('@noble/ed25519');
});

describe('Ed25519 verifier loading', () => {
  test('a verifier that cannot load rejects as verifier_unavailable', async () => {
    await withBrokenEd25519(async () => {
      const { verifyManifest } = require('../src/lib/verify');
      await expect(verifyManifest(MANIFEST)).rejects.toMatchObject({
        code: 'verifier_unavailable',
      });
    });
  });

  test('the integrity check passes the loader failure through (500, not 400)', async () => {
    await withBrokenEd25519(async () => {
      const tar = require('tar');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const {
        verifyBundleBinary,
        storeRefusal,
      } = require('../src/lib/bundle-integrity');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpk-'));
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(MANIFEST)
      );
      const out = path.join(dir, 'b.mpk');
      await tar.c({ gzip: true, file: out, cwd: dir }, ['manifest.json']);

      const err = await verifyBundleBinary(MANIFEST, fs.readFileSync(out)).then(
        () => null,
        e => e
      );
      expect(err).toMatchObject({ code: 'verifier_unavailable' });
      expect(storeRefusal(err)).toBeNull();
    });
  });

  test('require() refusing the ESM module falls back to import()', async () => {
    const {
      generateKeypair,
      signManifest,
    } = require('./helpers/ed25519-helper');
    const keys = await generateKeypair();
    const signed = await signManifest(
      { package: 'com.example.demo', appVersion: '1.0.0' },
      keys
    );
    await withBrokenEd25519(async () => {
      const { verifyManifest } = require('../src/lib/verify');
      await expect(verifyManifest(signed)).resolves.toBe(true);
    }, 'ERR_REQUIRE_ESM');
  });

  test('a genuinely wrong signature is still a plain verdict', async () => {
    const { verifyManifest } = require('../src/lib/verify');
    await expect(
      verifyManifest({ ...MANIFEST, appVersion: '9.9.9' })
    ).rejects.toThrow('Invalid signature');
  });
});
