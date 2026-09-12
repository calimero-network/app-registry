/**
 * Thumbnails, and the read path that serves them.
 *
 * The preview strip drew every screenshot into a 176px tile and loaded the
 * publisher's original to do it — up to 4MB each, eight per page. There is no
 * image library in this runtime (adding `sharp` puts a native binary in every
 * function), so the downscale happens in the browser and arrives as a second
 * buffer. That makes the thumbnail CALLER-SUPPLIED, which is why most of this
 * file is about refusing to trust it.
 *
 * ⚠️ THE TWO ASSERTIONS THAT MATTER MOST:
 *
 *  1. A thumbnail is sniffed like any other upload. Without that, `thumb` is a
 *     way to store an arbitrary blob under a package's prefix and have the
 *     registry hand it back with an image Content-Type.
 *  2. Reading an APPROVED asset resolves no identity. That is the whole
 *     performance fix — see the last block — and it is invisible in a
 *     response body, so only a spy can hold it in place.
 */

const store = new Map();
const sets = new Map();

const mockKv = {
  get: async k => (store.has(k) ? store.get(k) : null),
  set: async (k, v) => (store.set(k, v), 'OK'),
  del: async k => (store.delete(k) ? 1 : 0),
  incr: async k => {
    const next = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
    store.set(k, String(next));
    return next;
  },
  sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
  sAdd: async (k, ...m) => {
    if (!sets.has(k)) sets.set(k, new Set());
    m.flat().forEach(x => sets.get(k).add(String(x)));
    return m.length;
  },
  sRem: async (k, m) => (sets.get(k)?.delete(String(m)) ? 1 : 0),
  sIsMember: async (k, m) => (sets.get(k)?.has(String(m)) ? 1 : 0),
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

// ⚠️ The `mock` prefix is load-bearing: jest hoists these factories above
// every declaration, and only names starting with `mock` may be referenced.
const mockObjects = new Map();
jest.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return {
        file(key) {
          return {
            async save(buf) {
              mockObjects.set(key, Buffer.from(buf));
            },
            async download() {
              if (!mockObjects.has(key)) {
                const err = new Error('not found');
                err.code = 404;
                throw err;
              }
              return [mockObjects.get(key)];
            },
            async delete() {
              mockObjects.delete(key);
            },
          };
        },
      };
    }
  },
}));

process.env.GCS_BUCKET = 'test-bucket';

const PKG = 'com.example.shots';
const OWNER = 'owner@example.com';
const ADMIN = 'admin@calimero.network';

const mockResolveUser = jest.fn(async r => {
  const email = r.headers?.['x-test-user'];
  return email ? { id: email, email, username: email.split('@')[0] } : null;
});

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: (...args) => mockResolveUser(...args),
    requireAuth: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (!email) {
        res.status(401).json({ error: 'unauthenticated' });
        return null;
      }
      return { id: email, email, username: email.split('@')[0] };
    },
    canManagePackage: async (_pkg, _manifest, user) => user?.email === OWNER,
  };
});

jest.mock('../../../api/lib/admin-storage', () => ({
  isAdmin: async email => email === ADMIN,
  setAdminVerified: async () => {},
  getAdminVerified: async () => false,
}));

const assetsHandler = require('../../../api/v2/packages/[package]/assets/index');
const rawHandler = require('../../../api/v2/packages/[package]/assets/[assetId]/raw');
const review = require('../src/lib/package-review');
const { listAssets } = require('../src/lib/asset-store');

// Real magic bytes: everything here is identified by its own content, so a
// buffer of zeroes would simply be rejected as unrecognised.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(4096),
]);
const webp = (padding = 64) =>
  Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(padding),
  ]);
/** Not an image by its bytes — a WebM video header. */
const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(64),
]);

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    headers: {},
    sent: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
    send(p) {
      this.sent = p;
      return this;
    },
    end(p) {
      if (p !== undefined) this.sent = p;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

function req(method, { email = null, query = {}, body = undefined } = {}) {
  return {
    method,
    query,
    body,
    headers: email ? { 'x-test-user': email } : {},
    cookies: {},
  };
}

function seedPackage() {
  store.clear();
  sets.clear();
  mockObjects.clear();
  mockResolveUser.mockClear();
  sets.set('bundles:all', new Set([PKG]));
  sets.set(`bundle-versions:${PKG}`, new Set(['1.0.0']));
  store.set(
    `bundle:${PKG}/1.0.0`,
    JSON.stringify({
      json: {
        package: PKG,
        appVersion: '1.0.0',
        metadata: { author: 'owner', name: 'Shots', _ownerEmail: OWNER },
        signature: { pubkey: 'pk' },
      },
      created_at: '2026-01-01T00:00:00.000Z',
    })
  );
}

/** POST one asset as its owner. Returns the response, body and all. */
async function uploadOne(body) {
  const res = makeRes();
  await assetsHandler(
    req('POST', { email: OWNER, query: { package: PKG }, body }),
    res
  );
  return res;
}

/** GET the listing. */
async function listing({ email = null } = {}) {
  const res = makeRes();
  await assetsHandler(req('GET', { email, query: { package: PKG } }), res);
  return res;
}

/** Record an explicit decision, the way the admin route does. */
const approve = () => review.setReview(PKG, { state: 'approved', by: ADMIN });

async function getRaw(assetId, { variant, email = null } = {}) {
  const res = makeRes();
  await rawHandler(
    req('GET', {
      email,
      query: {
        package: PKG,
        assetId,
        ...(variant ? { variant } : {}),
      },
    }),
    res
  );
  return res;
}

beforeEach(seedPackage);

describe('storing a thumbnail', () => {
  it('keeps it as a second object and advertises it on the asset', async () => {
    const res = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
      width: 1600,
      height: 900,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.asset.hasThumb).toBe(true);
    expect(res.body.asset.thumbUrl).toContain('?variant=thumb');
    // The intrinsic size the client measured, so a tile can reserve its box.
    expect(res.body.asset.width).toBe(1600);
    expect(res.body.asset.height).toBe(900);

    // Two objects, under the assets prefix, the thumbnail suffixed.
    const keys = [...mockObjects.keys()];
    expect(keys).toHaveLength(2);
    expect(keys.some(k => k.endsWith('-thumb.webp'))).toBe(true);
  });

  it('refuses a "thumbnail" that is not an image, and still stores the asset', async () => {
    // Without the sniff this is how a video — or anything at all — gets stored
    // under a package prefix and served back with an image Content-Type.
    const res = await uploadOne({
      data: PNG.toString('base64'),
      thumb: WEBM.toString('base64'),
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.asset.hasThumb).toBe(false);
    expect([...mockObjects.keys()]).toHaveLength(1);
  });

  it('refuses a thumbnail that is not smaller than the original', async () => {
    // A "thumbnail" heavier than what it stands in for is a failed encode, and
    // storing it would make the strip slower than not having it.
    const res = await uploadOne({
      data: webp(16).toString('base64'),
      thumb: webp(9000).toString('base64'),
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.asset.hasThumb).toBe(false);
    expect([...mockObjects.keys()]).toHaveLength(1);
  });

  it('treats a corrupt thumbnail payload as simply absent', async () => {
    const res = await uploadOne({
      data: PNG.toString('base64'),
      thumb: 'not base64 at all !!!',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.asset.hasThumb).toBe(false);
  });
});

describe('serving a variant', () => {
  it('sends the thumbnail bytes under the THUMBNAIL content type', async () => {
    const created = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
    });
    const id = created.body.asset.id;
    await approve();

    const full = await getRaw(id);
    const thumb = await getRaw(id, { variant: 'thumb' });

    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('image/png');
    expect(full.sent).toHaveLength(PNG.length);

    // ⚠️ Serving a WebP re-encode as the original's `image/png` hands the
    // browser a file it will not decode — the bug this asserts against.
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
    expect(thumb.sent.length).toBeLessThan(PNG.length);
  });

  it('falls back to the original for an asset stored before thumbnails existed', async () => {
    // The strip asks for a thumbnail on every tile, and most of the index
    // predates them. A 404 here would blank the older half of every page.
    const created = await uploadOne({ data: PNG.toString('base64') });
    const id = created.body.asset.id;
    await approve();

    const res = await getRaw(id, { variant: 'thumb' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.sent).toHaveLength(PNG.length);
  });

  it('falls back when the thumbnail is indexed but missing from the bucket', async () => {
    const created = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
    });
    const id = created.body.asset.id;
    await approve();

    // Lose the object while keeping the index entry.
    const [, thumbKey] = [...mockObjects.keys()];
    mockObjects.delete(thumbKey);

    const res = await getRaw(id, { variant: 'thumb' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('still hides a pending asset from a stranger, whichever variant is asked for', async () => {
    const created = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
    });
    const id = created.body.asset.id;
    // No decision recorded: default-deny.

    for (const variant of [undefined, 'thumb']) {
      const res = await getRaw(id, { variant });
      expect(res.statusCode).toBe(404);
      expect(res.sent).toBeUndefined();
    }
  });
});

describe('removing an asset', () => {
  it('deletes the thumbnail as well as the original', async () => {
    // Leaving the small copy readable after its owner asked for the picture to
    // be taken down is the same leak, at a different key.
    const created = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
    });
    expect([...mockObjects.keys()]).toHaveLength(2);

    const { removeAsset } = require('../src/lib/asset-store');
    await removeAsset(PKG, created.body.asset.id);

    expect([...mockObjects.keys()]).toHaveLength(0);
    expect(await listAssets(PKG)).toHaveLength(0);
  });
});

describe('the read path does no work it does not need', () => {
  it('serves an APPROVED asset without resolving who is asking', async () => {
    // ⚠️ THIS IS THE PERFORMANCE FIX, AND NOTHING IN A RESPONSE BODY SHOWS IT.
    //
    // assetVisibility() returns on `approved` without reading isOwner or
    // isAdmin, so an approved package's assets are public and the asker cannot
    // change the answer. The handler used to resolve the user, look up site
    // admin and evaluate canManagePackage — a package→org lookup plus a
    // member-role read — and then throw all of it away. On every tile of every
    // app page.
    const created = await uploadOne({
      data: PNG.toString('base64'),
      thumb: webp().toString('base64'),
    });
    await approve();
    mockResolveUser.mockClear();

    const res = await getRaw(created.body.asset.id, { variant: 'thumb' });

    expect(res.statusCode).toBe(200);
    expect(mockResolveUser).not.toHaveBeenCalled();
  });

  it('DOES resolve identity when the asset is not public', async () => {
    // The other half of the same rule: skipping the lookup on a pending asset
    // would hide it from the owner who is allowed to see it.
    const created = await uploadOne({ data: PNG.toString('base64') });
    mockResolveUser.mockClear();

    const res = await getRaw(created.body.asset.id, { email: OWNER });

    expect(res.statusCode).toBe(200);
    expect(mockResolveUser).toHaveBeenCalled();
  });

  it('lists an approved package’s assets without resolving identity either', async () => {
    await uploadOne({ data: PNG.toString('base64') });
    await approve();
    mockResolveUser.mockClear();

    const res = await listing();

    expect(res.body.assets).toHaveLength(1);
    expect(mockResolveUser).not.toHaveBeenCalled();
  });
});
