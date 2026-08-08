/**
 * Proves the publish path actually calls the autolink helper. The unit tests
 * cover the rule; this covers the wiring, which is the part that silently
 * regresses when someone edits a handler.
 */

const store = new Map();
const sets = new Map();

const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async () => 1,
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sMembers: async k => [...setFor(k)],
  sIsMember: async (k, m) => setFor(k).has(m),
  sRem: async () => 0,
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 0,
  hDel: async () => 0,
  scanKeys: async () => [],
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));
jest.mock('../../../api/lib/kv-client', () => ({
  kv: mockKv,
  isDevelopment: true,
  isProduction: false,
}));

// Signature verification is not what this test is about.
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

const pushHandler = require('../../../api/v2/bundles/push');

const BOT = 'bot-merostudio@calimero.network';
const HUMAN = 'xabi@calimero.network';

function manifest(pkg) {
  return {
    version: '1.0',
    package: pkg,
    appVersion: '1.0.0',
    metadata: { name: 'T', description: 'd', author: 'a' },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
  };
}

async function publishAs(email, pkg) {
  store.clear();
  sets.clear();
  if (email) {
    const id = `id-${email}`;
    await mockKv.set(`email2user:${email}`, id);
    await mockKv.set(
      `user:${id}`,
      JSON.stringify({
        id,
        email,
        username: 'pub',
        ...(email === BOT ? { isBot: true, botOrg: 'calimero-network' } : {}),
      })
    );
    await mockKv.set(`apitoken:tok-${email}`, JSON.stringify({ email }));
    if (email === BOT) await mockKv.sAdd('bot:set', email);
  }
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  await pushHandler(
    {
      method: 'POST',
      body: manifest(pkg),
      headers: email ? { authorization: `Bearer tok-${email}` } : {},
    },
    res
  );
  return res;
}

describe('publish path wiring', () => {
  it('a bot push links the package to the bot org', async () => {
    const pkg = 'com.calimero-studio.wired';
    const res = await publishAs(BOT, pkg);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(await mockKv.get(`pkg2org:${pkg}`)).toBe('calimero-network');
  });

  it('a human push leaves the package unlinked', async () => {
    const pkg = 'com.calimero-studio.human';
    const res = await publishAs(HUMAN, pkg);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(await mockKv.get(`pkg2org:${pkg}`)).toBeNull();
  });
});
