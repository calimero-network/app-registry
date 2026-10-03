/**
 * The manifest signing payload carries a domain tag. The vector below is the
 * one pinned in core's `calimero-bundle` tests, so the registry and the signers
 * cannot drift apart on what is signed.
 */

const crypto = require('crypto');
const canonicalize = require('canonicalize');

const ed25519 = () => import('@noble/ed25519');

const VERIFIERS = {
  'packages/backend/src/lib/verify': require('../src/lib/verify'),
  'api/lib/verify': require('../../../api/lib/verify'),
};

const MANIFEST = {
  version: '1.0',
  package: 'com.example.app',
  appVersion: '1.0.0',
  minRuntimeVersion: '1.0.0',
  resources: [
    {
      role: 'executable',
      path: 'app.wasm',
      hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      size: 1024,
    },
  ],
};

const VECTOR = {
  canonical:
    '{"appVersion":"1.0.0","minRuntimeVersion":"1.0.0","package":"com.example.app","resources":[{"hash":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2","path":"app.wasm","role":"executable","size":1024}],"version":"1.0"}',
  payload: 'ce52b6437aa6e385d6ca6704775a2c7a89a5623e4f9520a7e411628d0ccf6c70',
  publicKey: '6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw',
  signature:
    'E-QrACBF4wcY_y90BgszUPa8Gu2MD1fPycE_PkLnue3iFMXzCXTRYmNUJSBbq7IBoBSYDh81dBr-RyJzIOaXCw',
};

const withSignature = signature => ({
  ...MANIFEST,
  signature: { algorithm: 'ed25519', ...signature },
});

describe.each(Object.entries(VERIFIERS))('%s', (_name, verifier) => {
  test('the vector is what the signers produce', () => {
    const canonical = canonicalize(MANIFEST);
    expect(canonical).toBe(VECTOR.canonical);
    const payload = crypto
      .createHash('sha256')
      .update(verifier.MANIFEST_SIGNING_DOMAIN)
      .update(canonical)
      .digest('hex');
    expect(payload).toBe(VECTOR.payload);
  });

  test('accepts a signature over the tagged payload', async () => {
    const manifest = withSignature({
      publicKey: VECTOR.publicKey,
      signature: VECTOR.signature,
    });
    await expect(verifier.verifyManifest(manifest)).resolves.toBe(true);
  });

  test('refuses a signature over the bare SHA-256 of the canonical bytes', async () => {
    const ed = await ed25519();
    const secretKey = new Uint8Array(32).fill(7);
    const untagged = crypto
      .createHash('sha256')
      .update(canonicalize(MANIFEST))
      .digest();
    const signature = await ed.signAsync(untagged, secretKey);
    const manifest = withSignature({
      publicKey: VECTOR.publicKey,
      signature: Buffer.from(signature).toString('base64url'),
    });
    await expect(verifier.verifyManifest(manifest)).rejects.toThrow(
      'Invalid signature'
    );
  });
});
