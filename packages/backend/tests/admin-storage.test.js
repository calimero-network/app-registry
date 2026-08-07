/**
 * Admin access and bot restriction rules.
 *
 * isAdmin grants admin to the whole calimero.network domain, and any org can
 * register a bot whose token lives in CI. Those two facts together are why bots
 * are denied here: the carve-out is what stands between a leaked CI token and
 * DELETE /api/admin/*. Bot identity is a set membership, not an email pattern,
 * so bots work for any org on any domain.
 */

const { createAdminStorage } = require('../../../shared/admin-storage');

function makeKv(initial = {}) {
  const sets = new Map();
  for (const [k, v] of Object.entries(initial)) sets.set(k, new Set(v));
  const setFor = k => {
    if (!sets.has(k)) sets.set(k, new Set());
    return sets.get(k);
  };
  return {
    sIsMember: async (key, member) => setFor(key).has(member),
    sAdd: async (key, member) => setFor(key).add(member),
    sRem: async (key, member) => setFor(key).delete(member),
    sMembers: async key => [...setFor(key)],
    set: async () => {},
    del: async () => {},
  };
}

describe('isAdmin', () => {
  it('grants admin to calimero.network humans', async () => {
    const { isAdmin } = createAdminStorage(makeKv());
    expect(await isAdmin('sandi@calimero.network')).toBe(true);
    expect(await isAdmin('XABI@Calimero.Network')).toBe(true);
  });

  it('still honours admin:set for non-domain humans', async () => {
    const kv = makeKv({ 'admin:set': ['fd.domovic@gmail.com'] });
    const { isAdmin } = createAdminStorage(kv);
    expect(await isAdmin('fd.domovic@gmail.com')).toBe(true);
    expect(await isAdmin('stranger@gmail.com')).toBe(false);
  });

  it('denies a bot even on the calimero.network domain', async () => {
    const kv = makeKv({ 'bot:set': ['ci@calimero.network'] });
    const { isAdmin } = createAdminStorage(kv);
    expect(await isAdmin('ci@calimero.network')).toBe(false);
  });

  it('denies a bot from any other org or domain', async () => {
    const kv = makeKv({ 'bot:set': ['release@acme.io'] });
    const { isAdmin } = createAdminStorage(kv);
    expect(await isAdmin('release@acme.io')).toBe(false);
  });

  it('keeps a bot non-admin even if it reaches admin:set', async () => {
    const kv = makeKv({
      'bot:set': ['ci@calimero.network'],
      'admin:set': ['ci@calimero.network'],
    });
    const { isAdmin } = createAdminStorage(kv);
    expect(await isAdmin('ci@calimero.network')).toBe(false);
  });

  it('returns false for empty input', async () => {
    const { isAdmin } = createAdminStorage(makeKv());
    expect(await isAdmin('')).toBe(false);
    expect(await isAdmin(null)).toBe(false);
  });
});

describe('isBot', () => {
  it('is set membership, case-insensitive, not an email pattern', async () => {
    const kv = makeKv({ 'bot:set': ['release@acme.io'] });
    const { isBot } = createAdminStorage(kv);
    expect(await isBot('release@acme.io')).toBe(true);
    expect(await isBot('RELEASE@Acme.IO')).toBe(true);
    // A human whose address merely looks bot-ish is not a bot.
    expect(await isBot('bot-lover@acme.io')).toBe(false);
    expect(await isBot('')).toBe(false);
  });

  it('addBot and removeBot round-trip', async () => {
    const { isBot, addBot, removeBot } = createAdminStorage(makeKv());
    expect(await isBot('ci@acme.io')).toBe(false);
    await addBot('CI@Acme.io');
    expect(await isBot('ci@acme.io')).toBe(true);
    await removeBot('ci@acme.io');
    expect(await isBot('ci@acme.io')).toBe(false);
  });
});
