/**
 * Publishes through the real push handler with a real Ed25519 signature; every
 * other push test mocks verifyManifest, so this is the one that proves it.
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

const pushHandler = require('../../../api/v2/bundles/push');
const listHandler = require('../../../api/v2/bundles/index');
const { generateKeypair, signManifest } = require('./helpers/ed25519-helper');
const { TEST_ICON } = require('./helpers/publishable');

const PKG = 'com.example.signed-flow';

function manifest(appVersion) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Signed Flow',
      description: 'A bundle used to exercise real signature verification.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
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

async function call(handler, req) {
  const res = makeRes();
  await handler({ headers: {}, ...req }, res);
  return { statusCode: res.statusCode, body: res.body };
}

const push = body => call(pushHandler, { method: 'POST', body });

let owner;

beforeAll(async () => {
  owner = await generateKeypair();
});

beforeEach(() => {
  store.clear();
  sets.clear();
});

describe('publishing with a real signature', () => {
  test('a signed bundle publishes and is listed', async () => {
    const pushed = await push(await signManifest(manifest('1.0.0'), owner));
    expect(pushed.statusCode).toBe(201);

    const listed = await call(listHandler, {
      method: 'GET',
      query: { package: PKG },
    });
    expect(listed.body.map(b => `${b.package}@${b.appVersion}`)).toEqual([
      `${PKG}@1.0.0`,
    ]);
  });

  test('a manifest changed after signing is rejected', async () => {
    const signed = await signManifest(manifest('1.0.0'), owner);
    signed.metadata.name = 'Tampered';
    const pushed = await push(signed);
    expect(pushed.statusCode).toBe(400);
    expect(pushed.body.error).toBe('invalid_signature');
  });

  test('an unsigned manifest is rejected', async () => {
    const pushed = await push(manifest('1.0.0'));
    expect(pushed.statusCode).toBe(400);
    expect(pushed.body.error).toBe('missing_signature');
  });

  test('the owner publishes a new version; another key cannot', async () => {
    await push(await signManifest(manifest('1.0.0'), owner));

    const next = await push(await signManifest(manifest('1.1.0'), owner));
    expect(next.statusCode).toBe(201);

    const intruder = await generateKeypair();
    const taken = await push(await signManifest(manifest('1.2.0'), intruder));
    expect(taken.statusCode).toBe(403);
    expect(taken.body.error).toBe('not_owner');
  });
});
