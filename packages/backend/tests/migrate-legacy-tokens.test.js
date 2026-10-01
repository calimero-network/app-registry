const crypto = require('crypto');
const {
  createApiTokenStorage,
  hashToken,
} = require('@calimero-network/registry-shared/api-token-storage');
const {
  migrateLegacyTokens,
  parseArgs,
} = require('../../../scripts/migrate-legacy-tokens');

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
    scanKeys: async pattern => {
      const prefix = pattern.replace(/\*$/, '');
      return [...store.keys()].filter(k => k.startsWith(prefix));
    },
  };
}

const EMAIL = 'dev@example.com';
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

async function seedLegacy(kv, email = EMAIL) {
  const token = crypto.randomBytes(32).toString('base64url');
  await kv.set(
    `apitoken:${token}`,
    JSON.stringify({ email, name: 'Dev', label: 'old', createdAt: 'x' })
  );
  await kv.sAdd(`user_tokens:${email}`, token);
  return token;
}

describe('migrate-legacy-tokens', () => {
  it('writes nothing without --apply', async () => {
    const kv = makeKv();
    const token = await seedLegacy(kv);
    const before = JSON.stringify([...kv.store.entries()]);

    const summary = await migrateLegacyTokens(kv, { nowMs: NOW });

    expect(summary).toMatchObject({ scanned: 1, rekeyed: 1 });
    expect(JSON.stringify([...kv.store.entries()])).toBe(before);
    expect(await kv.sMembers(`user_tokens:${EMAIL}`)).toEqual([token]);
  });

  it('re-keys a legacy record to its hash with an expiry', async () => {
    const kv = makeKv();
    const token = await seedLegacy(kv);

    const summary = await migrateLegacyTokens(kv, {
      apply: true,
      nowMs: NOW,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });

    expect(summary).toMatchObject({ rekeyed: 1, conflicts: 0 });
    const hash = hashToken(token);
    expect(kv.store.has(`apitoken:${token}`)).toBe(false);
    const rec = JSON.parse(kv.store.get(`apitoken:${hash}`));
    expect(rec).toMatchObject({
      email: EMAIL,
      label: 'old',
      createdAt: 'x',
      hashed: true,
      expiresAt: NOW + 30 * DAY,
    });
    expect(await kv.sMembers(`user_tokens:${EMAIL}`)).toEqual([hash]);

    const dump = JSON.stringify([
      ...kv.store.entries(),
      ...[...kv.sets.entries()].map(([k, v]) => [k, [...v]]),
    ]);
    expect(dump).not.toContain(token);
  });

  it('keeps the migrated token usable until its new expiry, even past the cutoff', async () => {
    const kv = makeKv();
    const token = await seedLegacy(kv);
    await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });

    const s = createApiTokenStorage(kv, { legacyAcceptedUntil: NOW });
    expect(await s.verify(token, NOW + DAY)).toMatchObject({ email: EMAIL });
    expect(await s.verify(token, NOW + 91 * DAY)).toBeNull();
  });

  it('adds an expiry to a hashed record that has none', async () => {
    const kv = makeKv();
    const key = `apitoken:${hashToken('t')}`;
    await kv.set(key, JSON.stringify({ email: EMAIL }));

    const summary = await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });

    expect(summary.expiryAdded).toBe(1);
    expect(JSON.parse(kv.store.get(key))).toMatchObject({
      hashed: true,
      expiresAt: NOW + 90 * DAY,
    });
  });

  it('leaves current tokens untouched and is idempotent', async () => {
    const kv = makeKv();
    const s = createApiTokenStorage(kv);
    const { token } = await s.create(EMAIL, 'Dev', 'CLI', {}, NOW);
    await seedLegacy(kv);
    const current = kv.store.get(`apitoken:${hashToken(token)}`);

    await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });
    const again = await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });

    expect(kv.store.get(`apitoken:${hashToken(token)}`)).toBe(current);
    expect(again).toMatchObject({ scanned: 2, rekeyed: 0, skipped: 2 });
  });

  it('never overwrites an existing hashed record', async () => {
    const kv = makeKv();
    const token = await seedLegacy(kv);
    const existing = JSON.stringify({
      email: 'other@example.com',
      hashed: true,
      expiresAt: NOW,
    });
    await kv.set(`apitoken:${hashToken(token)}`, existing);

    const summary = await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });

    expect(summary.conflicts).toBe(1);
    expect(kv.store.get(`apitoken:${hashToken(token)}`)).toBe(existing);
    expect(kv.store.has(`apitoken:${token}`)).toBe(true);
  });

  it('skips raw-key records that are not legacy and unreadable ones', async () => {
    const kv = makeKv();
    await kv.set(
      'apitoken:raw-with-expiry',
      JSON.stringify({ email: EMAIL, expiresAt: NOW })
    );
    await kv.set('apitoken:broken', '{ not json');

    const summary = await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });

    expect(summary).toMatchObject({ skipped: 1, invalid: 1, rekeyed: 0 });
    expect(kv.store.has('apitoken:raw-with-expiry')).toBe(true);
  });

  it('parses its flags', () => {
    expect(parseArgs([])).toMatchObject({ apply: false });
    expect(parseArgs(['--apply', '--max-age-days', '30'])).toEqual({
      apply: true,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });
    expect(() => parseArgs(['--max-age-days', 'soon'])).toThrow();
  });
});
