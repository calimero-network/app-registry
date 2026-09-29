/**
 * PATCH /api/v2/bundles/:pkg/:version edits a published version's metadata.
 *
 * A valid owner signature is not enough on its own: every signed manifest of a
 * version stays valid, so an older one could be sent again to put back
 * descriptions, links or owner keys that were since changed. The edit also
 * needs a logged-in account that may manage the package (the same rule as
 * delete and yank), and it may not change `owners[]`.
 *
 * `links.*` are rendered as hrefs, so they must be http(s) — on publish, on
 * edit, and on output for anything stored before the rule existed.
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
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(true),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('owner-key'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(s => s || null),
}));

// Real requireAuth when nobody is logged in (so the 401 is the handler's own
// answer), a fixed user otherwise. canManagePackage stays real.
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
const { linkProblems, safeLinks } = require('../src/lib/metadata-policy');
const { createBundleSanitizers } = require('../src/lib/bundle-sanitize');

const PKG = 'com.example.app';
const KEY = `bundle:${PKG}/1.0.0`;

const AUTHOR = { email: 'author@example.com', username: 'author-user' };
const ORG_ADMIN = { email: 'admin@example.org', username: 'admin-user' };
const ORG_MEMBER = { email: 'member@example.org', username: 'member-user' };
const OUTSIDER = { email: 'nobody@example.net', username: 'nobody' };

const stored = {
  version: '1.0',
  package: PKG,
  appVersion: '1.0.0',
  metadata: {
    name: 'App',
    description: 'The current description.',
    author: 'author-user',
    _ownerEmail: 'author@example.com',
  },
  owners: ['owner-key'],
  links: { github: 'https://github.com/example/app' },
  wasm: { path: 'app.wasm', hash: 'a'.repeat(64), size: 10 },
  signature: { algorithm: 'ed25519', publicKey: 'owner-key', signature: 's' },
};

function edit(overrides = {}) {
  const metadata = { ...stored.metadata };
  delete metadata._ownerEmail;
  return {
    ...stored,
    metadata: { ...metadata, description: 'An edited description.' },
    ...overrides,
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

async function patch(user, body, headers = {}) {
  mockCurrentUser = user;
  const r = res();
  await handler(
    {
      method: 'PATCH',
      query: { package: PKG, version: '1.0.0' },
      headers,
      body,
    },
    r
  );
  return r;
}

function saved() {
  return JSON.parse(mockKVData.get(KEY)).json;
}

beforeEach(() => {
  mockKVData.clear();
  mockSets.clear();
  mockHashes.clear();
  mockKVData.set(KEY, JSON.stringify({ json: stored }));
  mockKVData.set(`pkg2org:${PKG}`, 'example-org');
  mockHashes.set('org:example-org:roles', {
    [ORG_ADMIN.email]: 'admin',
    [ORG_MEMBER.email]: 'member',
  });
  mockCurrentUser = null;
});

describe('PATCH /api/v2/bundles/:pkg/:version — who may edit', () => {
  test('a signed manifest with no login is refused with 401', async () => {
    const r = await patch(null, edit());
    expect(r.status).toHaveBeenCalledWith(401);
    expect(saved().metadata.description).toBe('The current description.');
  });

  test('an unrelated account is refused with 403', async () => {
    const r = await patch(OUTSIDER, edit());
    expect(r.status).toHaveBeenCalledWith(403);
    expect(saved().metadata.description).toBe('The current description.');
  });

  test('a plain org member is refused with 403', async () => {
    const r = await patch(ORG_MEMBER, edit());
    expect(r.status).toHaveBeenCalledWith(403);
  });

  test('the author can edit', async () => {
    const r = await patch(AUTHOR, edit());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(saved().metadata.description).toBe('An edited description.');
    // Server-owned metadata survives the edit.
    expect(saved().metadata._ownerEmail).toBe('author@example.com');
  });

  test('an admin of the linked org can edit', async () => {
    const r = await patch(ORG_ADMIN, edit());
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

describe('PATCH /api/v2/bundles/:pkg/:version — what may change', () => {
  test('adding an owner key is refused', async () => {
    const r = await patch(
      AUTHOR,
      edit({ owners: ['owner-key', 'someone-else'] })
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(saved().owners).toEqual(['owner-key']);
  });

  test('dropping owners[] is refused', async () => {
    const body = edit();
    delete body.owners;
    const r = await patch(AUTHOR, body);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  test('the same owners in another order is not a change', async () => {
    mockKVData.set(
      KEY,
      JSON.stringify({ json: { ...stored, owners: ['k1', 'owner-key'] } })
    );
    const r = await patch(AUTHOR, edit({ owners: ['owner-key', 'k1'] }));
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<b>x</b>'],
    ['relative', '/somewhere'],
  ])('a %s link is refused with 400', async (_label, url) => {
    const r = await patch(AUTHOR, edit({ links: { docs: url } }));
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'invalid_links' })
    );
    expect(saved().links).toEqual(stored.links);
  });

  test('an https link is accepted', async () => {
    const r = await patch(
      AUTHOR,
      edit({ links: { docs: 'https://docs.example.com' } })
    );
    expect(r.status).toHaveBeenCalledWith(200);
    expect(saved().links).toEqual({ docs: 'https://docs.example.com' });
  });
});

describe('links policy', () => {
  test('linkProblems names each non-http(s) link', () => {
    expect(
      linkProblems({
        github: 'https://github.com/x/y',
        docs: 'javascript:alert(1)',
        frontend: 'file:///etc/passwd',
      })
    ).toEqual([
      '`links.docs` must be an http(s) URL.',
      '`links.frontend` must be an http(s) URL.',
    ]);
  });

  test('absent or empty links are fine; a non-object is not', () => {
    expect(linkProblems(undefined)).toEqual([]);
    expect(linkProblems(null)).toEqual([]);
    expect(linkProblems({ docs: '' })).toEqual([]);
    expect(linkProblems('https://x.example')).toHaveLength(1);
    expect(linkProblems({ docs: 42 })).toHaveLength(1);
  });

  test('safeLinks drops non-http(s) values', () => {
    expect(
      safeLinks({
        github: 'https://github.com/x/y',
        docs: 'javascript:alert(1)',
        frontend: 'data:text/html,x',
      })
    ).toEqual({ github: 'https://github.com/x/y' });
  });
});

describe('sanitizer output', () => {
  const review = { isApproved: async () => false };
  const bundle = {
    ...stored,
    links: {
      github: 'https://github.com/example/app',
      docs: 'javascript:alert(1)',
    },
  };

  test('sanitizeBundle drops a stored non-http(s) link', async () => {
    const { sanitizeBundle } = createBundleSanitizers(mockKv, review);
    const out = await sanitizeBundle(bundle, PKG);
    expect(out.links).toEqual({ github: 'https://github.com/example/app' });
  });

  test('sanitizeBundles drops it too', async () => {
    const { sanitizeBundles } = createBundleSanitizers(mockKv, review);
    const [out] = await sanitizeBundles([{ bundle, packageName: PKG }]);
    expect(out.links).toEqual({ github: 'https://github.com/example/app' });
  });

  test('a bundle without links gains no links key', async () => {
    const noLinks = { ...stored };
    delete noLinks.links;
    const { sanitizeBundle } = createBundleSanitizers(mockKv, review);
    const out = await sanitizeBundle(noLinks, PKG);
    expect('links' in out).toBe(false);
  });
});
