/**
 * PATCH with the real verifier against versions stored before `signerId` was
 * required.
 *
 * Push never required `signerId`, so older versions are stored without one.
 * An edit now has to verify, and verifying requires a `signerId` equal to the
 * signing key, so every edit of such a version carries one. The lock on
 * `signerId` must not turn that into "this version can never be edited
 * again", while a `signerId` that is already stored stays locked.
 */

const mockKVData = new Map();
const mockSets = new Map();
const mockHashes = new Map();
const mockKv = {
  get: jest.fn(async k => mockKVData.get(k) ?? null),
  set: jest.fn(async (k, v) => {
    mockKVData.set(k, v);
    return 'OK';
  }),
  setNX: jest.fn(async () => true),
  sAdd: jest.fn(async () => 1),
  sMembers: jest.fn(async k => [...(mockSets.get(k) || [])]),
  sIsMember: jest.fn(async (k, m) => !!mockSets.get(k)?.has(m)),
  hGet: jest.fn(async (k, f) => mockHashes.get(k)?.[f] ?? null),
  hGetAll: jest.fn(async k => ({ ...(mockHashes.get(k) || {}) })),
  del: jest.fn(async () => 1),
};

jest.mock('../src/lib/kv-client', () => ({ kv: mockKv }));
jest.mock('../../../api/lib/kv-client', () => ({ kv: mockKv }));
jest.mock('../src/lib/blob-store', () => ({
  putBinary: jest.fn(async () => '1'),
  getBinary: jest.fn(async () => null),
  deleteBinary: jest.fn(async () => {}),
}));

let mockCurrentUser = null;
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    requireAuth: async (req, res) =>
      mockCurrentUser || actual.requireAuth(req, res),
  };
});

const handler = require('../../../api/v2/bundles/[package]/[version]');
const {
  didKey,
  generateKeypair,
  signManifest,
} = require('./helpers/ed25519-helper');

const PKG = 'com.example.legacy';
const KEY = `bundle:${PKG}/1.0.0`;
const AUTHOR = { email: 'author@example.com', username: 'author-user' };

const b64u = bytes => Buffer.from(bytes).toString('base64url');

function base(ownerKey) {
  return {
    version: '1.0',
    package: PKG,
    appVersion: '1.0.0',
    metadata: {
      name: 'Legacy App',
      description: 'The current description.',
      author: 'author-user',
    },
    owners: [ownerKey],
    wasm: { path: 'app.wasm', hash: 'a'.repeat(64), size: 10 },
  };
}

function res() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
}

async function patch(body) {
  mockCurrentUser = AUTHOR;
  const r = res();
  await handler(
    {
      method: 'PATCH',
      query: { package: PKG, version: '1.0.0' },
      headers: {},
      body,
    },
    r
  );
  return r;
}

function store(manifest) {
  mockKVData.set(KEY, JSON.stringify({ json: manifest }));
}

function saved() {
  return JSON.parse(mockKVData.get(KEY)).json;
}

/** A signed edit of `stored` that changes only the description. */
async function signedEdit(keys, extra = {}) {
  const ownerKey = b64u(keys.publicKey);
  const body = await signManifest(
    {
      ...base(ownerKey),
      metadata: { ...base(ownerKey).metadata, description: 'Edited.' },
      ...extra,
    },
    keys
  );
  return body;
}

let keys;
beforeEach(async () => {
  mockKVData.clear();
  mockSets.clear();
  mockHashes.clear();
  mockCurrentUser = null;
  keys = await generateKeypair();
});

describe('PATCH a version stored without signerId', () => {
  function legacy() {
    const ownerKey = b64u(keys.publicKey);
    return {
      ...base(ownerKey),
      metadata: { ...base(ownerKey).metadata, _ownerEmail: AUTHOR.email },
      signature: {
        algorithm: 'ed25519',
        publicKey: ownerKey,
        signature: 'old',
      },
    };
  }

  test('an owner-signed edit is accepted and records the signerId', async () => {
    store(legacy());
    const r = await patch(await signedEdit(keys));
    expect(r.status).toHaveBeenCalledWith(200);
    expect(saved().metadata.description).toBe('Edited.');
    expect(saved().signerId).toBe(didKey(Buffer.from(keys.publicKey)));
  });

  test('after that first edit the recorded signerId is locked', async () => {
    store(legacy());
    await patch(await signedEdit(keys));
    const other = await generateKeypair();
    const r = await patch(
      await signedEdit(keys, { signerId: didKey(Buffer.from(other.publicKey)) })
    );
    // A foreign signerId no longer matches the signing key.
    expect(r.status).toHaveBeenCalledWith(400);
    expect(saved().signerId).toBe(didKey(Buffer.from(keys.publicKey)));
  });

  test('an edit signed by a key that is not an owner is refused', async () => {
    store(legacy());
    const stranger = await generateKeypair();
    const body = await signManifest(
      {
        ...base(b64u(keys.publicKey)),
        metadata: { ...base(b64u(keys.publicKey)).metadata, description: 'X' },
      },
      stranger
    );
    const r = await patch(body);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(saved().metadata.description).toBe('The current description.');
  });

  test('an edit without a signerId is refused by the verifier', async () => {
    store(legacy());
    const body = await signedEdit(keys);
    delete body.signerId;
    const r = await patch(body);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].error).toBe('invalid_signature');
  });
});

describe('PATCH a version stored with signerId', () => {
  test('a metadata edit by the same signer is accepted', async () => {
    const original = await signManifest(base(b64u(keys.publicKey)), keys);
    store({
      ...original,
      metadata: { ...original.metadata, _ownerEmail: AUTHOR.email },
    });
    const r = await patch(await signedEdit(keys));
    expect(r.status).toHaveBeenCalledWith(200);
    expect(saved().metadata.description).toBe('Edited.');
  });

  test('a different signerId, even one that verifies, is refused', async () => {
    const original = await signManifest(base(b64u(keys.publicKey)), keys);
    store({
      ...original,
      // Stored under another signer id than the key that will sign the edit.
      signerId: 'did:key:z6MkStoredSignerThatIsNotThisKey',
      metadata: { ...original.metadata, _ownerEmail: AUTHOR.email },
    });
    const r = await patch(await signedEdit(keys));
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].message).toMatch(/signerId/);
  });
});
