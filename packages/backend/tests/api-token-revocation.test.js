/**
 * A revoked API token stays revoked even when a request using it is in flight,
 * a token whose account profile is gone no longer resolves, and revoke takes
 * only the exact token id the token list shows.
 */

const jwt = require('jsonwebtoken');

const store = new Map();
const sets = new Map();
let writeGate = null;
const setFor = k => {
  if (!sets.has(k)) sets.set(k, new Set());
  return sets.get(k);
};
const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => {
    if (writeGate && k.startsWith('apitoken:')) await writeGate;
    store.set(k, v);
    return 'OK';
  },
  setXX: async (k, v) => {
    if (writeGate && k.startsWith('apitoken:')) await writeGate;
    if (!store.has(k)) return false;
    store.set(k, v);
    return true;
  },
  setNX: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
  del: async k => (store.delete(k) || sets.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...setFor(k)] : []),
  sAdd: async (k, ...m) => (m.flat().forEach(x => setFor(k).add(String(x))), 1),
  sRem: async (k, ...m) => (
    m.flat().forEach(x => setFor(k).delete(String(x))),
    1
  ),
  sIsMember: async (k, m) => setFor(k).has(String(m)),
  hGetAll: async () => ({}),
  hGet: async () => null,
  hSet: async () => 1,
  hDel: async () => 0,
  incr: async () => 1,
  scanKeys: async pattern => {
    const p = pattern.replace(/\*$/, '');
    return [...store.keys()].filter(k => k.startsWith(p));
  },
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

const SESSION_SECRET = 'test-session-secret';
process.env.SESSION_SECRET = SESSION_SECRET;

const { apiTokens } = require('../../../api/lib/api-token-storage');
const { resolveUser, requireAuth } = require('../../../api/lib/auth-helpers');
const revokeHandler = require('../../../api/auth/token/[tokenId]');
const adminUserHandler = require('../../../api/admin/users/[userId]');
const {
  hashToken,
} = require('@calimero-network/registry-shared/api-token-storage');

const EMAIL = 'dev@example.com';
const ADMIN = 'ops@calimero.network';
const BOT = 'ci-bot@example.com';
const SAME_ORIGIN = {
  origin: 'https://apps.calimero.network',
  host: 'apps.calimero.network',
};

function seedProfile(email) {
  store.set(`email2user:${email}`, `u-${email}`);
  store.set(`user:u-${email}`, JSON.stringify({ id: `u-${email}`, email }));
}

function sessionCookie(email) {
  seedProfile(email);
  const token = jwt.sign({ sub: `u-${email}`, email }, SESSION_SECRET, {
    algorithm: 'HS256',
  });
  return `app_registry_session=${token}`;
}

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

const bearer = token => ({ headers: { authorization: `Bearer ${token}` } });

async function revoke(email, tokenId) {
  const res = makeRes();
  await revokeHandler(
    {
      method: 'DELETE',
      query: { tokenId },
      headers: { ...SAME_ORIGIN, cookie: sessionCookie(email) },
    },
    res
  );
  return res;
}

async function whileVerifyIsInFlight(token, action) {
  let release;
  writeGate = new Promise(r => {
    release = r;
  });
  const inflight = resolveUser(bearer(token));
  await new Promise(r => setImmediate(r));
  await action();
  release();
  writeGate = null;
  return inflight;
}

beforeEach(() => {
  store.clear();
  sets.clear();
  writeGate = null;
});

describe('revoking a token while a request is using it', () => {
  it('a user revoke is not undone by the lastUsed write', async () => {
    seedProfile(EMAIL);
    const { token, tokenId } = await apiTokens.create(EMAIL, 'Dev', 'ci');

    const inflight = await whileVerifyIsInFlight(token, async () => {
      expect((await revoke(EMAIL, tokenId)).statusCode).toBe(204);
    });
    expect(inflight.email).toBe(EMAIL);

    expect(store.has(`apitoken:${hashToken(token)}`)).toBe(false);
    expect(await resolveUser(bearer(token))).toBeNull();
  });

  it('an admin revoke_tokens is not undone by the lastUsed write', async () => {
    seedProfile(EMAIL);
    const { token } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    const cookie = sessionCookie(ADMIN);

    await whileVerifyIsInFlight(token, async () => {
      const res = makeRes();
      await adminUserHandler(
        {
          method: 'PATCH',
          query: { userId: `u-${EMAIL}` },
          body: { action: 'revoke_tokens' },
          headers: { ...SAME_ORIGIN, cookie },
        },
        res
      );
      expect(res.statusCode).toBe(200);
    });

    expect(store.has(`apitoken:${hashToken(token)}`)).toBe(false);
    expect(await resolveUser(bearer(token))).toBeNull();
  });

  it('a legacy token revoked mid-request stays revoked', async () => {
    seedProfile(EMAIL);
    const legacy = 'legacy-raw-token-value';
    store.set(`apitoken:${legacy}`, JSON.stringify({ email: EMAIL }));
    setFor(`user_tokens:${EMAIL}`).add(legacy);

    await whileVerifyIsInFlight(legacy, async () => {
      expect((await revoke(EMAIL, legacy.slice(0, 8))).statusCode).toBe(204);
    });

    expect(store.has(`apitoken:${legacy}`)).toBe(false);
    expect(await resolveUser(bearer(legacy))).toBeNull();
  });

  it('still stamps lastUsed on a live token', async () => {
    seedProfile(EMAIL);
    const { token } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    expect((await resolveUser(bearer(token))).email).toBe(EMAIL);
    const rec = JSON.parse(store.get(`apitoken:${hashToken(token)}`));
    expect(typeof rec.lastUsed).toBe('string');
  });
});

describe('Bearer tokens require a live profile', () => {
  it('refuses a token whose profile was deleted', async () => {
    seedProfile(EMAIL);
    const { token } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    expect((await resolveUser(bearer(token))).email).toBe(EMAIL);

    store.delete(`email2user:${EMAIL}`);
    store.delete(`user:u-${EMAIL}`);
    expect(store.has(`apitoken:${hashToken(token)}`)).toBe(true);
    expect(await resolveUser(bearer(token))).toBeNull();
  });

  it('refuses a token whose owner has no profile', async () => {
    const { token } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    expect(await resolveUser(bearer(token))).toBeNull();
  });

  it('still resolves a bot token, which requireAuth then confines', async () => {
    seedProfile(BOT);
    const { token } = await apiTokens.create(BOT, 'CI', 'release');
    setFor('bot:set').add(BOT);

    expect(await resolveUser(bearer(token))).toMatchObject({ email: BOT });

    const res = makeRes();
    expect(await requireAuth(bearer(token), res)).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('bot_forbidden');
  });
});

describe('DELETE /api/auth/token/:tokenId', () => {
  it.each([['a'], [''], ['abcdef0'], ['abcdef012'], ['abc/ef01']])(
    'refuses %p, which is not a full token id',
    async tokenId => {
      seedProfile(EMAIL);
      const { token } = await apiTokens.create(EMAIL, 'Dev', 'ci');
      const res = await revoke(EMAIL, tokenId);
      expect(res.statusCode).toBe(400);
      expect(store.has(`apitoken:${hashToken(token)}`)).toBe(true);
    }
  );

  it('refuses a short prefix of a real token id', async () => {
    seedProfile(EMAIL);
    const { token, tokenId } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    const res = await revoke(EMAIL, tokenId.slice(0, 1));
    expect(res.statusCode).toBe(400);
    expect(store.has(`apitoken:${hashToken(token)}`)).toBe(true);
  });

  it('revokes by the exact id create() returned', async () => {
    seedProfile(EMAIL);
    const { token, tokenId } = await apiTokens.create(EMAIL, 'Dev', 'ci');
    expect((await revoke(EMAIL, tokenId)).statusCode).toBe(204);
    expect(store.has(`apitoken:${hashToken(token)}`)).toBe(false);
    expect(sets.get(`user_tokens:${EMAIL}`).size).toBe(0);
  });

  it('answers 404 for a well-formed id the caller does not hold', async () => {
    seedProfile(EMAIL);
    await apiTokens.create(EMAIL, 'Dev', 'ci');
    expect((await revoke(EMAIL, 'zzzzzzzz')).statusCode).toBe(404);
  });
});
