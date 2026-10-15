import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { loadSigningKey, signClaim } from '../lib/package-claim.js';

// The same vector is verified by the registry in packages/backend/tests/package-claim.test.js.
const VECTOR = {
  seed: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
  publicKey: '6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw',
  signature:
    'OOaq945kfdJU7rnoVCahCJRAdSjZB-lEg6lv0qxxVMU5EfkVPqrwcz9RaMFmT1gh0ChcTTjnY9d1oyu9n3FRBg',
  issuedAt: '2026-10-15T00:00:00.000Z',
};

describe('signClaim', () => {
  it('signs the claim the registry verifies', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-key-'));
    try {
      const keyFile = path.join(dir, 'key.json');
      fs.writeFileSync(keyFile, JSON.stringify({ private_key: VECTOR.seed }));
      const claim = signClaim(
        loadSigningKey(keyFile),
        'Com.Acme.Claimed',
        'Holder@Example.com',
        'https://apps.calimero.network/api',
        VECTOR.issuedAt
      );
      expect(claim).toEqual({
        publicKey: VECTOR.publicKey,
        signature: VECTOR.signature,
        issuedAt: VECTOR.issuedAt,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a key file without a 32-byte seed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-key-'));
    try {
      const keyFile = path.join(dir, 'key.json');
      fs.writeFileSync(keyFile, JSON.stringify({ private_key: 'AAAA' }));
      expect(() => loadSigningKey(keyFile)).toThrow(/not an Ed25519 key/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
