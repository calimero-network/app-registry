/**
 * API (CLI/Bearer) token storage rules.
 *
 * The security properties mirror refresh tokens: new tokens are not recoverable
 * from a Redis dump and carry an expiry. The hardening had to be backward
 * compatible, so the load-bearing cases are the legacy ones — a plaintext,
 * no-expiry token created before this change must keep resolving forever.
 */

const crypto = require('crypto');
const {
  createApiTokenStorage,
  hashToken,
  parseLegacyCutoff,
} = require('@calimero-network/registry-shared/api-token-storage');

function makeKv() {
  const store = new Map();
  const sets = new Map();
  const setFor = k => {
    if (!sets.has(k)) sets.set(k, new Set());
    return sets.get(k);
  };
  return {
    store,
    sets,
    get: async k => (store.has(k) ? store.get(k) : null),
    set: async (k, v) => (store.set(k, v), 'OK'),
    setXX: async (k, v) => (store.has(k) ? (store.set(k, v), true) : false),
    del: async k => (store.delete(k) ? 1 : 0),
    sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(x)), 1),
    sMembers: async k => [...setFor(k)],
    sRem: async (k, ...m) => (m.flat().forEach(x => setFor(k).delete(x)), 1),
  };
}

const EMAIL = 'dev@example.com';
const DAY = 24 * 60 * 60 * 1000;

describe('api token storage', () => {
  it('mints a token that verifies back to its owner', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    const { token } = await s.create(EMAIL, 'Dev', 'CLI');
    const rec = await s.verify(token);
    expect(rec.email).toBe(EMAIL);
    expect(rec.label).toBe('CLI');
  });

  it('stores the hash at rest, never the raw token', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    const { token, tokenId } = await s.create(EMAIL, 'Dev', 'CLI');

    // A dump of Redis must not contain anything replayable.
    const dump = JSON.stringify([
      ...kv.store.entries(),
      ...[...kv.sets.entries()].map(([k, v]) => [k, [...v]]),
    ]);
    expect(dump).not.toContain(token);

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    expect([...kv.store.keys()]).toContain(`apitoken:${hash}`);
    // The user's set indexes the hash, not the raw value.
    expect(await kv.sMembers(`user_tokens:${EMAIL}`)).toEqual([hash]);
    // tokenId shown to the UI is the first 8 hex of that hash.
    expect(tokenId).toBe(hash.slice(0, 8));
  });

  it('resolves a LEGACY plaintext token stored under the raw key', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    // Simulate a token minted before hashing: raw key, no expiresAt.
    const legacy = 'legacy-plaintext-token';
    await kv.set(
      `apitoken:${legacy}`,
      JSON.stringify({ email: EMAIL, name: 'Dev', label: 'old' })
    );
    await kv.sAdd(`user_tokens:${EMAIL}`, legacy);

    const rec = await s.verify(legacy);
    expect(rec.email).toBe(EMAIL);
    // Hashing the same value must NOT be where it was found.
    expect(kv.store.has(`apitoken:${hashToken(legacy)}`)).toBe(false);
  });

  it('grandfathers a token with no expiresAt (never expires)', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    await kv.set(
      `apitoken:${hashToken('t')}`,
      JSON.stringify({ email: EMAIL }) // no expiresAt
    );
    // Far in the future, still valid.
    const rec = await s.verify('t', Date.now() + 3650 * DAY);
    expect(rec.email).toBe(EMAIL);
  });

  it('rejects a token once past its expiresAt, accepts it before', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv, { maxAgeSeconds: 90 * 24 * 60 * 60 });
    const now = 1_000_000_000;
    const { token } = await s.create(EMAIL, 'Dev', 'CLI', {}, now);

    expect(await s.verify(token, now + 89 * DAY)).not.toBeNull();
    expect(await s.verify(token, now + 91 * DAY)).toBeNull();
  });

  it('updates lastUsed on use, best-effort', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    const now = 1_000_000_000;
    const { token } = await s.create(EMAIL, 'Dev', 'CLI', {}, now);
    const at = now + 1000; // within the token's lifetime
    await s.verify(token, at);
    const rec = JSON.parse(kv.store.get(`apitoken:${hashToken(token)}`));
    expect(rec.lastUsed).toBe(new Date(at).toISOString());
  });

  it('a failed lastUsed write does not fail the request', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    const { token } = await s.create(EMAIL, 'Dev', 'CLI');
    kv.setXX = async () => {
      throw new Error('redis down');
    };
    await expect(s.verify(token)).resolves.toMatchObject({ email: EMAIL });
  });

  it('rejects empty, unknown and malformed tokens without throwing', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    expect(await s.verify('')).toBeNull();
    expect(await s.verify(null)).toBeNull();
    expect(await s.verify('nope')).toBeNull();
    await kv.set(`apitoken:${hashToken('bad')}`, '{ not json');
    await expect(s.verify('bad')).resolves.toBeNull();
  });

  describe('legacy fallback accepts only legacy records', () => {
    it('does not resolve the stored key name of a new token', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      const { token } = await s.create(EMAIL, 'Dev', 'CLI');
      const stored = hashToken(token);
      expect(kv.store.has(`apitoken:${stored}`)).toBe(true);

      expect(await s.verify(stored)).toBeNull();
      // Its lastUsed must not have been touched by the refused lookup.
      const rec = JSON.parse(kv.store.get(`apitoken:${stored}`));
      expect(rec.lastUsed).toBeUndefined();
    });

    it('still resolves a new token presented raw', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      const { token } = await s.create(EMAIL, 'Dev', 'CLI');
      const rec = await s.verify(token);
      expect(rec).toMatchObject({ email: EMAIL, hashed: true });
    });

    it('still resolves a legacy base64url token stored under its raw value', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      const legacy = crypto.randomBytes(32).toString('base64url');
      await kv.set(
        `apitoken:${legacy}`,
        JSON.stringify({ email: EMAIL, name: 'Dev', label: 'old' })
      );
      const rec = await s.verify(legacy, Date.now() + 3650 * DAY);
      expect(rec.email).toBe(EMAIL);
    });

    it('refuses a raw-key record that carries an expiry or the hashed marker', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      await kv.set(
        'apitoken:raw-with-expiry',
        JSON.stringify({ email: EMAIL, expiresAt: Date.now() + DAY })
      );
      await kv.set(
        'apitoken:raw-with-marker',
        JSON.stringify({ email: EMAIL, hashed: true })
      );
      expect(await s.verify('raw-with-expiry')).toBeNull();
      expect(await s.verify('raw-with-marker')).toBeNull();
    });

    it('rejects an expired new token', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv, { maxAgeSeconds: 60 });
      const now = 1_000_000_000;
      const { token } = await s.create(EMAIL, 'Dev', 'CLI', {}, now);
      expect(await s.verify(token, now + 61 * 1000)).toBeNull();
      expect(await s.verify(hashToken(token), now + 61 * 1000)).toBeNull();
    });

    it('an extra field cannot drop the expiry or the marker', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      const { token } = await s.create(EMAIL, 'Dev', 'CLI', {
        expiresAt: undefined,
        hashed: false,
      });
      const rec = JSON.parse(kv.store.get(`apitoken:${hashToken(token)}`));
      expect(typeof rec.expiresAt).toBe('number');
      expect(rec.hashed).toBe(true);
    });
  });

  describe('legacy cutoff', () => {
    const CUTOFF = 1_800_000_000_000;

    async function seed(kv) {
      const legacy = crypto.randomBytes(32).toString('base64url');
      await kv.set(`apitoken:${legacy}`, JSON.stringify({ email: EMAIL }));
      await kv.set(
        `apitoken:${hashToken('no-expiry')}`,
        JSON.stringify({ email: EMAIL })
      );
      return legacy;
    }

    it('accepts records without an expiry before the cutoff', async () => {
      const kv = makeKv();
      const legacy = await seed(kv);
      const s = createApiTokenStorage(kv, { legacyAcceptedUntil: CUTOFF });
      expect(await s.verify(legacy, CUTOFF - 1)).not.toBeNull();
      expect(await s.verify('no-expiry', CUTOFF - 1)).not.toBeNull();
    });

    it('refuses records without an expiry from the cutoff on', async () => {
      const kv = makeKv();
      const legacy = await seed(kv);
      const s = createApiTokenStorage(kv, { legacyAcceptedUntil: CUTOFF });
      expect(await s.verify(legacy, CUTOFF)).toBeNull();
      expect(await s.verify('no-expiry', CUTOFF)).toBeNull();
    });

    it('does not affect tokens that carry an expiry', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv, { legacyAcceptedUntil: CUTOFF });
      const { token } = await s.create(EMAIL, 'Dev', 'CLI', {}, CUTOFF);
      expect(await s.verify(token, CUTOFF + DAY)).not.toBeNull();
    });

    it('reads the cutoff from the environment', async () => {
      const prev = process.env.LEGACY_API_TOKENS_ACCEPTED_UNTIL;
      try {
        process.env.LEGACY_API_TOKENS_ACCEPTED_UNTIL = '2027-01-01T00:00:00Z';
        expect(createApiTokenStorage(makeKv()).legacyAcceptedUntil).toBe(
          Date.parse('2027-01-01T00:00:00Z')
        );
        delete process.env.LEGACY_API_TOKENS_ACCEPTED_UNTIL;
        expect(createApiTokenStorage(makeKv()).legacyAcceptedUntil).toBeNull();
      } finally {
        if (prev === undefined) {
          delete process.env.LEGACY_API_TOKENS_ACCEPTED_UNTIL;
        } else {
          process.env.LEGACY_API_TOKENS_ACCEPTED_UNTIL = prev;
        }
      }
    });

    it('parses ISO dates and epoch milliseconds, ignores anything else', () => {
      expect(parseLegacyCutoff('2027-01-01')).toBe(Date.parse('2027-01-01'));
      expect(parseLegacyCutoff('1800000000000')).toBe(1_800_000_000_000);
      expect(parseLegacyCutoff('')).toBeNull();
      expect(parseLegacyCutoff(undefined)).toBeNull();
      expect(parseLegacyCutoff('soon')).toBeNull();
    });
  });

  it('default lifetime is 90 days', () => {
    const s = createApiTokenStorage(makeKv());
    expect(s.maxAgeSeconds).toBe(90 * 24 * 60 * 60);
  });
});
