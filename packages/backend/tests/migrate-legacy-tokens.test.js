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
    sIsMember: async (k, m) => setFor(k).has(m),
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

async function seedLegacy(kv, email = EMAIL, { indexed = true } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  await kv.set(
    `apitoken:${token}`,
    JSON.stringify({ email, name: 'Dev', label: 'old', createdAt: 'x' })
  );
  if (indexed) await kv.sAdd(`user_tokens:${email}`, token);
  return token;
}

async function seedHashedWithoutExpiry(kv, { indexed = true } = {}) {
  const hash = hashToken(crypto.randomBytes(32).toString('base64url'));
  await kv.set(`apitoken:${hash}`, JSON.stringify({ email: EMAIL }));
  if (indexed) await kv.sAdd(`user_tokens:${EMAIL}`, hash);
  return `apitoken:${hash}`;
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
    const key = await seedHashedWithoutExpiry(kv);

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

  describe("records missing from their owner's token set", () => {
    it('does not migrate an unindexed legacy record, so the cutoff still ends it', async () => {
      const kv = makeKv();
      const token = await seedLegacy(kv, EMAIL, { indexed: false });
      const before = kv.store.get(`apitoken:${token}`);
      const lines = [];

      const summary = await migrateLegacyTokens(kv, {
        apply: true,
        nowMs: NOW,
        log: l => lines.push(l),
      });

      expect(summary).toMatchObject({ scanned: 1, rekeyed: 0, orphans: 1 });
      expect(kv.store.get(`apitoken:${token}`)).toBe(before);
      expect(kv.store.has(`apitoken:${hashToken(token)}`)).toBe(false);
      expect(lines).toEqual([`orphan    ${token.slice(0, 8)}… ${EMAIL}`]);

      const s = createApiTokenStorage(kv, { legacyAcceptedUntil: NOW });
      expect(await s.verify(token, NOW + DAY)).toBeNull();
    });

    it('does not migrate a legacy record indexed under another account', async () => {
      const kv = makeKv();
      const token = await seedLegacy(kv, EMAIL, { indexed: false });
      await kv.sAdd('user_tokens:other@example.com', token);

      const summary = await migrateLegacyTokens(kv, {
        apply: true,
        nowMs: NOW,
      });

      expect(summary).toMatchObject({ rekeyed: 0, orphans: 1 });
      expect(kv.store.has(`apitoken:${hashToken(token)}`)).toBe(false);
    });

    it('gives no expiry to an unindexed hashed record', async () => {
      const kv = makeKv();
      const key = await seedHashedWithoutExpiry(kv, { indexed: false });

      const summary = await migrateLegacyTokens(kv, {
        apply: true,
        nowMs: NOW,
      });

      expect(summary).toMatchObject({ expiryAdded: 0, orphans: 1 });
      expect(JSON.parse(kv.store.get(key)).expiresAt).toBeUndefined();
    });

    it('leaves orphans in place unless --delete-orphans is passed', async () => {
      const kv = makeKv();
      const token = await seedLegacy(kv, EMAIL, { indexed: false });
      const key = await seedHashedWithoutExpiry(kv, { indexed: false });

      await migrateLegacyTokens(kv, { apply: true, nowMs: NOW });
      expect(kv.store.has(`apitoken:${token}`)).toBe(true);
      expect(kv.store.has(key)).toBe(true);

      await migrateLegacyTokens(kv, { deleteOrphans: true, nowMs: NOW });
      expect(kv.store.has(`apitoken:${token}`)).toBe(true);
      expect(kv.store.has(key)).toBe(true);
    });

    it('deletes orphans with --apply --delete-orphans', async () => {
      const kv = makeKv();
      const orphan = await seedLegacy(kv, EMAIL, { indexed: false });
      const orphanKey = await seedHashedWithoutExpiry(kv, { indexed: false });
      const kept = await seedLegacy(kv);

      const summary = await migrateLegacyTokens(kv, {
        apply: true,
        deleteOrphans: true,
        nowMs: NOW,
      });

      expect(summary).toMatchObject({ rekeyed: 1, orphans: 2 });
      expect(kv.store.has(`apitoken:${orphan}`)).toBe(false);
      expect(kv.store.has(`apitoken:${hashToken(orphan)}`)).toBe(false);
      expect(kv.store.has(orphanKey)).toBe(false);
      expect(kv.store.has(`apitoken:${hashToken(kept)}`)).toBe(true);
    });

    it('counts each kind of record in the summary', async () => {
      const kv = makeKv();
      const s = createApiTokenStorage(kv);
      await s.create(EMAIL, 'Dev', 'CLI', {}, NOW);
      await seedLegacy(kv);
      await seedLegacy(kv, 'other@example.com');
      await seedHashedWithoutExpiry(kv);
      await seedLegacy(kv, EMAIL, { indexed: false });
      await seedHashedWithoutExpiry(kv, { indexed: false });
      await kv.set('apitoken:broken', '{ not json');

      const summary = await migrateLegacyTokens(kv, { nowMs: NOW });

      expect(summary).toEqual({
        scanned: 7,
        rekeyed: 2,
        expiryAdded: 1,
        skipped: 1,
        conflicts: 0,
        invalid: 1,
        orphans: 2,
      });
    });
  });

  it('parses its flags', () => {
    expect(parseArgs([])).toMatchObject({ apply: false });
    expect(parseArgs([])).toMatchObject({ deleteOrphans: false });
    expect(parseArgs(['--apply', '--max-age-days', '30'])).toEqual({
      apply: true,
      deleteOrphans: false,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });
    expect(parseArgs(['--apply', '--delete-orphans'])).toMatchObject({
      apply: true,
      deleteOrphans: true,
    });
    expect(() => parseArgs(['--max-age-days', 'soon'])).toThrow();
  });
});
