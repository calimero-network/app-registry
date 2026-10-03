const { Readable } = require('stream');

const store = new Map();
const sets = new Map();
const hashes = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  setNX: async (k, v) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
  del: async k => (store.delete(k) ? 1 : 0),
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async () => 0,
  sIsMember: async (k, m) => (sets.has(k) ? sets.get(k).has(String(m)) : false),
  hGetAll: async k => (hashes.has(k) ? { ...hashes.get(k) } : {}),
  hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
  hSet: async (k, obj) => {
    if (!hashes.has(k)) hashes.set(k, {});
    Object.assign(hashes.get(k), obj);
    return Object.keys(obj).length;
  },
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
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async () => '1'),
  getBinary: jest.fn(async () => null),
  deleteBinary: jest.fn(async () => {}),
}));

const mockAdmins = new Set();
const mockBots = new Set();
const mockProfiles = new Map();
const mockAdminStorage = () => ({
  isAdmin: async email => mockAdmins.has(email),
  isBot: async email => mockBots.has(email),
});
const mockUserStorage = () => ({
  getUserByEmail: async email =>
    mockProfiles.get(email) || { email, username: email.split('@')[0] },
});
jest.mock('../../../api/lib/admin-storage', () => mockAdminStorage());
jest.mock('../src/lib/admin-storage', () => mockAdminStorage());
jest.mock('../../../api/lib/user-storage', () => mockUserStorage());
jest.mock('../src/lib/user-storage', () => mockUserStorage());

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async r => {
      const email = r.headers?.['x-test-user'];
      return email ? { id: email, email } : null;
    },
  };
});

const { TEST_ICON } = require('./helpers/publishable');
const { generateKeypair, signBundle } = require('./helpers/ed25519-helper');
const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const orgs = require('../../../api/lib/org-storage');
const devOrgs = require('../src/lib/org-storage');

const PKG = 'com.acme.bound';
const ORG = 'org-acme';
const OWNER = 'owner@example.com';
const MEMBER = 'member@example.com';
const STRANGER = 'stranger@example.com';
const BOT = 'bot-acme@bots.example.com';
const OTHER_BOT = 'bot-other@bots.example.com';
const SITE_ADMIN = 'site-admin@example.com';
const STAFF = 'someone@calimero.network';

let packageKey;

function manifest(appVersion) {
  return {
    version: '1.0',
    package: PKG,
    appVersion,
    metadata: {
      name: 'Bound',
      description: 'A package used to exercise who may publish with its key.',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
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

async function push(email, body) {
  const res = makeRes();
  await pushHandler(
    { method: 'POST', body, headers: email ? { 'x-test-user': email } : {} },
    res
  );
  return res;
}

async function pushFile(email, bundle) {
  const boundary = 'boundbundle';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="b.mpk"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    Buffer.from(bundle._binary, 'hex'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
    'x-test-user': email,
  };
  const res = makeRes();
  await pushFileHandler(req, res);
  return res;
}

function stored(version) {
  const raw = store.get(`bundle:${PKG}/${version}`);
  return raw ? JSON.parse(raw).json : null;
}

function seedLegacyVersion(version) {
  store.set(
    `bundle:${PKG}/${version}`,
    JSON.stringify({
      json: {
        ...manifest(version),
        signature: {
          algorithm: 'ed25519',
          publicKey: Buffer.from(packageKey.publicKey).toString('base64url'),
          signature: 'unused',
        },
      },
    })
  );
  sets.set(`bundle-versions:${PKG}`, new Set([version]));
}

beforeAll(async () => {
  packageKey = await generateKeypair();
});

beforeEach(() => {
  store.clear();
  sets.clear();
  hashes.clear();
  mockAdmins.clear();
  mockBots.clear();
  mockProfiles.clear();
});

describe('a package with a recorded owner', () => {
  beforeEach(async () => {
    const first = await push(
      OWNER,
      await signBundle(manifest('1.0.0'), packageKey)
    );
    expect(first.statusCode).toBe(201);
    expect(stored('1.0.0').metadata._ownerEmail).toBe(OWNER);
  });

  test('the owner publishes the next version', async () => {
    const res = await push(
      OWNER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
  });

  test('another account holding a version signed with the package key is refused', async () => {
    const res = await push(
      STRANGER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('not_owner');
    expect(res.body.message).toMatch(/account publishing it/);
    expect(stored('1.1.0')).toBeNull();
  });

  test('push-file refuses the same .mpk from another account', async () => {
    const res = await pushFile(
      STRANGER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('not_owner');
    expect(stored('1.1.0')).toBeNull();
  });

  test('push-file accepts the .mpk from the owner', async () => {
    const res = await pushFile(
      OWNER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
  });

  test('a site admin and a staff account may publish with the package key', async () => {
    mockAdmins.add(SITE_ADMIN);
    expect(
      (await push(SITE_ADMIN, await signBundle(manifest('1.1.0'), packageKey)))
        .statusCode
    ).toBe(201);
    expect(
      (await push(STAFF, await signBundle(manifest('1.2.0'), packageKey)))
        .statusCode
    ).toBe(201);
  });

  test('a new version without _binary is refused and nothing is stored', async () => {
    const { _binary, ...withoutBinary } = await signBundle(
      manifest('1.1.0'),
      packageKey
    );
    expect(_binary).toBeTruthy();
    const res = await push(OWNER, withoutBinary);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_binary');
    expect(stored('1.1.0')).toBeNull();
    expect(
      (await push(OWNER, { ...withoutBinary, _binary: '' })).body.error
    ).toBe('missing_binary');
  });
});

describe('a package linked to an organization', () => {
  beforeEach(async () => {
    const first = await push(
      OWNER,
      await signBundle(manifest('1.0.0'), packageKey)
    );
    expect(first.statusCode).toBe(201);
    await orgs.setPkg2Org(PKG, ORG);
    await orgs.addOrgMember(ORG, MEMBER, 'member');
  });

  test('a member of the organization publishes with the package key', async () => {
    const res = await push(
      MEMBER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
  });

  test("the organization's bot publishes with the package key", async () => {
    mockBots.add(BOT);
    mockProfiles.set(BOT, { email: BOT, username: 'bot-acme', botOrg: ORG });
    const res = await push(
      BOT,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
  });

  test("another organization's bot is refused", async () => {
    mockBots.add(OTHER_BOT);
    mockProfiles.set(OTHER_BOT, {
      email: OTHER_BOT,
      username: 'bot-other',
      botOrg: 'org-other',
    });
    const res = await push(
      OTHER_BOT,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(403);
    expect(stored('1.1.0')).toBeNull();
  });

  test('an account outside the organization is refused', async () => {
    const res = await push(
      STRANGER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('a legacy package with no recorded owner', () => {
  beforeEach(() => seedLegacyVersion('1.0.0'));

  test('keeps key-only publishing while it has no organization', async () => {
    const res = await push(
      STRANGER,
      await signBundle(manifest('1.1.0'), packageKey)
    );
    expect(res.statusCode).toBe(201);
    expect(stored('1.1.0').metadata._ownerEmail).toBeUndefined();
  });

  test('requires a member once it is linked to an organization', async () => {
    await orgs.setPkg2Org(PKG, ORG);
    await orgs.addOrgMember(ORG, MEMBER, 'member');
    expect(
      (await push(STRANGER, await signBundle(manifest('1.1.0'), packageKey)))
        .statusCode
    ).toBe(403);
    expect(
      (await push(MEMBER, await signBundle(manifest('1.1.0'), packageKey)))
        .statusCode
    ).toBe(201);
  });
});

describe('a first publish', () => {
  test('without _binary is refused', async () => {
    const { _binary, ...withoutBinary } = await signBundle(
      manifest('1.0.0'),
      packageKey
    );
    expect(_binary).toBeTruthy();
    const res = await push(OWNER, withoutBinary);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_binary');
    expect(stored('1.0.0')).toBeNull();
  });
});

describe('resolvePublishPermission answers the same in api/lib and the dev server', () => {
  const KEY = 'cGFja2FnZS1rZXk';
  const owned = {
    package: PKG,
    appVersion: '1.0.0',
    metadata: { _ownerEmail: OWNER },
    signature: { algorithm: 'ed25519', publicKey: KEY, signature: 's' },
  };
  const legacy = { ...owned, metadata: {} };

  test.each([
    ['api/lib', orgs],
    ['dev server', devOrgs],
  ])('%s', async (_label, lib) => {
    mockBots.add(BOT);
    mockProfiles.set(BOT, { email: BOT, botOrg: ORG });
    mockAdmins.add(SITE_ADMIN);
    const allowed = { allowed: true, viaOrg: false, ownerKeys: null };

    await expect(
      lib.resolvePublishPermission(owned, KEY, PKG, OWNER)
    ).resolves.toEqual(allowed);
    await expect(
      lib.resolvePublishPermission(owned, KEY, PKG, STRANGER)
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      lib.resolvePublishPermission(owned, KEY, PKG, undefined)
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      lib.resolvePublishPermission(owned, KEY, PKG, SITE_ADMIN)
    ).resolves.toEqual(allowed);
    await expect(
      lib.resolvePublishPermission(owned, KEY, PKG, STAFF)
    ).resolves.toEqual(allowed);
    await expect(
      lib.resolvePublishPermission(legacy, KEY, PKG, STRANGER)
    ).resolves.toEqual(allowed);

    await orgs.setPkg2Org(PKG, ORG);
    await orgs.addOrgMember(ORG, MEMBER, 'member');
    await expect(
      lib.resolvePublishPermission(legacy, KEY, PKG, STRANGER)
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      lib.resolvePublishPermission(legacy, KEY, PKG, MEMBER)
    ).resolves.toEqual(allowed);
    await expect(
      lib.resolvePublishPermission(legacy, KEY, PKG, BOT)
    ).resolves.toEqual(allowed);
  });
});
