/**
 * The registry must refuse every manifest a node refuses: core verifies with
 * ed25519-dalek `verify_strict` and requires `signerId` to be the signing key.
 */

const crypto = require('crypto');
const { didKey, signingPayload } = require('./helpers/ed25519-helper');

const ed25519 = () => import('@noble/ed25519');

const VERIFIERS = {
  'packages/backend/src/lib/verify': require('../src/lib/verify'),
  'api/lib/verify': require('../../../api/lib/verify'),
};

const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const IDENTITY = Buffer.alloc(32);
IDENTITY[0] = 1;
// The order-2 point (0, -1).
const TORSION = Buffer.from(
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'hex'
);

const MANIFEST = {
  version: '1.0',
  package: 'com.example.strict',
  appVersion: '1.0.0',
};

const b64u = bytes => Buffer.from(bytes).toString('base64url');
const leBytes = n => {
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return out;
};
const leNumber = bytes =>
  BigInt(`0x${Buffer.from(bytes).reverse().toString('hex')}`);

function signed(publicKey, signature, signerId = didKey(publicKey)) {
  return {
    ...MANIFEST,
    signerId,
    signature: {
      algorithm: 'ed25519',
      publicKey: b64u(publicKey),
      signature: b64u(signature),
    },
  };
}

/** Signs with a chosen nonce point `R`, so tests can build edge-case signatures. */
async function signWithR(manifest, R, r = 0n) {
  const ed = await ed25519();
  const ext = await ed.utils.getExtendedPublicKeyAsync(crypto.randomBytes(32));
  const publicKey = Buffer.from(ext.pointBytes);
  const unsigned = { ...manifest, signerId: didKey(publicKey) };
  const k =
    leNumber(
      crypto
        .createHash('sha512')
        .update(R)
        .update(publicKey)
        .update(signingPayload(unsigned))
        .digest()
    ) % L;
  const s = (r + k * ext.scalar) % L;
  return signed(publicKey, Buffer.concat([R, leBytes(s)]));
}

describe.each(Object.entries(VERIFIERS))('%s', (_name, verifier) => {
  test('accepts a genuine signature with a matching signerId', async () => {
    const ed = await ed25519();
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(secretKey));
    const unsigned = { ...MANIFEST, signerId: didKey(publicKey) };
    const signature = await ed.signAsync(signingPayload(unsigned), secretKey);
    await expect(
      verifier.verifyManifest(signed(publicKey, signature))
    ).resolves.toBe(true);
  });

  test('refuses a small-order public key that verifies any manifest', async () => {
    const signature = Buffer.concat([IDENTITY, Buffer.alloc(32)]);
    await expect(
      verifier.verifyManifest(signed(IDENTITY, signature))
    ).rejects.toThrow('Invalid signature');
  });

  test('refuses a small-order nonce point', async () => {
    await expect(
      verifier.verifyManifest(await signWithR(MANIFEST, IDENTITY))
    ).rejects.toThrow('Invalid signature');
  });

  test('refuses a signature that only passes the cofactored equation', async () => {
    const ed = await ed25519();
    const r = 12345n;
    const R = Buffer.from(
      ed.Point.BASE.multiply(r).add(ed.Point.fromBytes(TORSION, true)).toBytes()
    );
    await expect(
      verifier.verifyManifest(await signWithR(MANIFEST, R, r))
    ).rejects.toThrow('Invalid signature');
  });

  test('refuses a non-canonical S', async () => {
    const ed = await ed25519();
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(secretKey));
    const unsigned = { ...MANIFEST, signerId: didKey(publicKey) };
    const signature = Buffer.from(
      await ed.signAsync(signingPayload(unsigned), secretKey)
    );
    const s = leNumber(signature.subarray(32)) + L;
    const malleated = Buffer.concat([signature.subarray(0, 32), leBytes(s)]);
    await expect(
      verifier.verifyManifest(signed(publicKey, malleated))
    ).rejects.toThrow('Invalid signature');
  });

  test('refuses a signerId that is not the signing key', async () => {
    const ed = await ed25519();
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(secretKey));
    const other = didKey(
      Buffer.from(await ed.getPublicKeyAsync(ed.utils.randomSecretKey()))
    );
    const unsigned = { ...MANIFEST, signerId: other };
    const signature = await ed.signAsync(signingPayload(unsigned), secretKey);
    await expect(
      verifier.verifyManifest(signed(publicKey, signature, other))
    ).rejects.toThrow('signerId');
  });

  test('refuses a manifest without a signerId', async () => {
    const ed = await ed25519();
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(secretKey));
    const signature = await ed.signAsync(signingPayload(MANIFEST), secretKey);
    const manifest = signed(publicKey, signature);
    delete manifest.signerId;
    await expect(verifier.verifyManifest(manifest)).rejects.toThrow('signerId');
  });

  describe('encodings core refuses', () => {
    async function genuine(nonce = 0, tweak = sig => sig) {
      const ed = await ed25519();
      const secretKey = ed.utils.randomSecretKey();
      const publicKey = Buffer.from(await ed.getPublicKeyAsync(secretKey));
      const unsigned = { ...MANIFEST, nonce, signerId: didKey(publicKey) };
      const sig = Buffer.from(
        await ed.signAsync(signingPayload(unsigned), secretKey)
      );
      const { signature } = signed(publicKey, sig);
      return { ...unsigned, signature: tweak(signature) };
    }

    // Flips the unused trailing bits of the last base64url character.
    const withTrailingBits = text => {
      const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const last = alphabet.indexOf(text.at(-1));
      return text.slice(0, -1) + alphabet[last | 1];
    };

    test('baseline: the helper manifest verifies', async () => {
      await expect(verifier.verifyManifest(await genuine())).resolves.toBe(
        true
      );
    });

    test.each([
      ['padded base64 key', s => ({ ...s, publicKey: `${s.publicKey}=` })],
      [
        'key with a junk character',
        s => ({ ...s, publicKey: `${s.publicKey}!` }),
      ],
      [
        'key with non-canonical trailing bits',
        s => ({ ...s, publicKey: withTrailingBits(s.publicKey) }),
      ],
      [
        'signature with non-canonical trailing bits',
        s => ({ ...s, signature: withTrailingBits(s.signature) }),
      ],
      ['padded signature', s => ({ ...s, signature: `${s.signature}==` })],
      ['uppercase algorithm', s => ({ ...s, algorithm: 'ED25519' })],
      [
        'alg/pubkey/sig aliases',
        s => ({ alg: s.algorithm, pubkey: s.publicKey, sig: s.signature }),
      ],
    ])('refuses %s', async (_label, tweak) => {
      await expect(
        verifier.verifyManifest(await genuine(0, tweak))
      ).rejects.toThrow();
    });

    test('refuses a standard-base64 signature containing + or /', async () => {
      let manifest;
      for (let nonce = 0; nonce < 500 && !manifest; nonce++) {
        const candidate = await genuine(nonce);
        const std = Buffer.from(
          candidate.signature.signature,
          'base64url'
        ).toString('base64');
        if (/[+/]/.test(std)) {
          manifest = {
            ...candidate,
            signature: {
              ...candidate.signature,
              signature: std.replace(/=+$/, ''),
            },
          };
        }
      }
      expect(manifest).toBeDefined();
      await expect(verifier.verifyManifest(manifest)).rejects.toThrow();
    });
  });
});
