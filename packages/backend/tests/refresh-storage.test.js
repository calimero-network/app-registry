/**
 * Refresh token rules.
 *
 * The interesting properties are the security ones: tokens are not recoverable
 * from a Redis dump, a spent token cannot be replayed, an expired one stops
 * working without any sweeper running, and logout can end every session.
 */

const crypto = require('crypto');
const {
  createRefreshStorage,
} = require('@calimero-network/registry-shared/refresh-storage');

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
    del: async k => (store.delete(k) ? 1 : 0),
    sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(x)), 1),
    sMembers: async k => [...setFor(k)],
    sRem: async (k, ...m) => (m.flat().forEach(x => setFor(k).delete(x)), 1),
  };
}

const EMAIL = 'ronit@calimero.network';
const HOUR = 60 * 60 * 1000;

describe('refresh tokens', () => {
  it('issues a token that verifies back to its owner', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const token = await r.issue(EMAIL, 'user-1');
    expect(await r.verify(token)).toEqual({ email: EMAIL, userId: 'user-1' });
  });

  it('never stores the token value, only its hash', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const token = await r.issue(EMAIL, 'user-1');

    const keys = [...kv.store.keys()];
    expect(keys.some(k => k.includes(token))).toBe(false);
    // A dump of Redis must not contain anything replayable.
    expect(JSON.stringify([...kv.store.entries()])).not.toContain(token);

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    expect(keys).toContain(`refresh:${hash}`);
  });

  it('rotate returns a new token and retires the old one', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const first = await r.issue(EMAIL, 'user-1');

    const rotated = await r.rotate(first);
    expect(rotated.email).toBe(EMAIL);
    expect(rotated.token).not.toBe(first);

    expect(await r.verify(first)).toBeNull();
    expect(await r.verify(rotated.token)).toEqual({
      email: EMAIL,
      userId: 'user-1',
    });
  });

  it('refuses to replay a spent token', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const first = await r.issue(EMAIL, 'user-1');
    await r.rotate(first);
    expect(await r.rotate(first)).toBeNull();
  });

  it('lets only one of several concurrent rotations win', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const token = await r.issue(EMAIL, 'user-1');

    // Two tabs refreshing at the same moment both read a live record; the
    // atomic delete is what decides which one may mint a replacement.
    const results = await Promise.all([
      r.rotate(token),
      r.rotate(token),
      r.rotate(token),
    ]);

    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(await r.verify(winners[0].token)).not.toBeNull();
    expect(await r.verify(token)).toBeNull();
  });

  it('expires without any sweeper, and cleans up on the way past', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv, { maxAgeSeconds: 60 });
    const now = 1_000_000;
    const token = await r.issue(EMAIL, 'user-1', now);

    expect(await r.verify(token, now + 59_000)).not.toBeNull();
    expect(await r.verify(token, now + 61_000)).toBeNull();
    // The dead record is removed rather than left behind.
    expect(kv.store.size).toBe(0);
    expect(await kv.sMembers(`user_refresh:${EMAIL}`)).toEqual([]);
  });

  it('revokeAllForEmail ends every session for that user', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const a = await r.issue(EMAIL, 'user-1');
    const b = await r.issue(EMAIL, 'user-1');
    const other = await r.issue('someone@else.com', 'user-2');

    expect(await r.revokeAllForEmail(EMAIL)).toBe(2);
    expect(await r.verify(a)).toBeNull();
    expect(await r.verify(b)).toBeNull();
    // Another user's session is untouched.
    expect(await r.verify(other)).not.toBeNull();
  });

  it('revoke removes the token and its index entry', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const token = await r.issue(EMAIL, 'user-1');
    await r.revoke(token);
    expect(await r.verify(token)).toBeNull();
    expect(await kv.sMembers(`user_refresh:${EMAIL}`)).toEqual([]);
  });

  it('rejects unknown, empty and malformed tokens', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    expect(await r.verify('not-a-real-token')).toBeNull();
    expect(await r.verify('')).toBeNull();
    expect(await r.verify(null)).toBeNull();
    expect(await r.rotate(undefined)).toBeNull();
  });

  it('treats an unparseable stored record as a bad token, not a crash', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const token = await r.issue(EMAIL, 'user-1');
    const key = [...kv.store.keys()].find(k => k.startsWith('refresh:'));
    kv.store.set(key, '{ this is not json');

    // A partial write must not turn a routine bad-token path into a 500.
    await expect(r.verify(token)).resolves.toBeNull();
    await expect(r.rotate(token)).resolves.toBeNull();
    await expect(r.revoke(token)).resolves.not.toThrow();
    expect(kv.store.has(key)).toBe(false);
  });

  it('issues distinct tokens and normalises the email', async () => {
    const kv = makeKv();
    const r = createRefreshStorage(kv);
    const a = await r.issue('Ronit@Calimero.Network', 'user-1');
    const b = await r.issue(EMAIL, 'user-1');
    expect(a).not.toBe(b);
    expect((await r.verify(a)).email).toBe(EMAIL);
    expect(await r.revokeAllForEmail(EMAIL)).toBe(2);
  });

  it('default lifetime is 30 days', async () => {
    const r = createRefreshStorage(makeKv());
    expect(r.maxAgeSeconds).toBe(60 * 60 * 24 * 30);
    const token = await r.issue(EMAIL, 'user-1', 0);
    expect(await r.verify(token, 29 * 24 * HOUR)).not.toBeNull();
    expect(await r.verify(token, 31 * 24 * HOUR)).toBeNull();
  });
});
