/**
 * The asset and moderation ROUTES, not the helpers underneath them.
 *
 * The helpers had 14 tests and the routes had none, which is the wrong way
 * round: the gate is only worth anything at the HTTP boundary, and every
 * interesting failure here is a route assembling its own response and
 * forgetting to ask.
 *
 * ⚠️ THE ASSERTION THAT MATTERS MOST is that a pending asset's bytes are not
 * served to a stranger. Everything else in this file can be right and that one
 * wrong, and the moderation gate is decorative.
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

// The bucket is the one thing that cannot run in-process. Object bytes live in
// a Map; everything the routes do around them is real.
//
// ⚠️ THE `mock` PREFIX IS LOAD-BEARING. `jest.mock` factories are hoisted
// above every declaration in the file, so a factory closing over an ordinary
// `const` fails to compile — jest allows the reference only for names
// starting with `mock`.
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

const assetsHandler = require('../../../api/v2/packages/[package]/assets/index');
const rawHandler = require('../../../api/v2/packages/[package]/assets/[assetId]/raw');
const packageHandler = require('../../../api/v2/packages/[package]/index');
const adminPkgHandler = require('../../../api/admin/packages/[packageName]');
const queueHandler = require('../../../api/admin/review-queue');
const review = require('../src/lib/package-review');

const PKG = 'com.example.shots';
const OWNER = 'owner@example.com';
const ADMIN = 'admin@calimero.network';
const STRANGER = 'someone@example.com';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
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

/** A request carrying a resolvable session for `email`, or anonymous. */
function req(method, { email = null, query = {}, body = undefined } = {}) {
  return {
    method,
    query,
    body,
    headers: email ? { 'x-test-user': email } : {},
    cookies: {},
  };
}

jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return {
    ...actual,
    resolveUser: async r => {
      const email = r.headers?.['x-test-user'];
      return email ? { id: email, email, username: email.split('@')[0] } : null;
    },
    requireAuth: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (!email) {
        res.status(401).json({ error: 'unauthenticated' });
        return null;
      }
      return { id: email, email, username: email.split('@')[0] };
    },
    requireAdmin: async (r, res) => {
      const email = r.headers?.['x-test-user'];
      if (email !== ADMIN) {
        res.status(403).json({ error: 'forbidden' });
        return null;
      }
      return { id: email, email };
    },
    canManagePackage: async (_pkg, _manifest, user) => user?.email === OWNER,
  };
});

jest.mock('../../../api/lib/admin-storage', () => ({
  isAdmin: async email => email === 'admin@calimero.network',
  setAdminVerified: async () => {},
  getAdminVerified: async () => false,
}));

function seedPackage() {
  store.clear();
  sets.clear();
  mockObjects.clear();
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

async function upload(email = OWNER) {
  const res = makeRes();
  await assetsHandler(
    req('POST', {
      email,
      query: { package: PKG },
      body: { data: PNG.toString('base64'), alt: 'a screenshot' },
    }),
    res
  );
  return res;
}

beforeEach(seedPackage);

describe('upload', () => {
  test('the owner can upload', async () => {
    const res = await upload();
    expect(res.statusCode).toBe(201);
    expect(res.body.asset.kind).toBe('image');
  });

  test('a stranger cannot', async () => {
    const res = await upload(STRANGER);
    expect(res.statusCode).toBe(403);
  });

  test('an anonymous caller cannot', async () => {
    const res = makeRes();
    await assetsHandler(
      req('POST', {
        query: { package: PKG },
        body: { data: PNG.toString('base64') },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  test('the bytes decide the type, not the caller', async () => {
    // ⚠️ A Content-Type header is attacker-controlled. This posts a PNG and
    // claims it is a video; the sniffer has to win, or "images only" means
    // nothing.
    const res = makeRes();
    await assetsHandler(
      req('POST', {
        email: OWNER,
        query: { package: PKG },
        body: { data: PNG.toString('base64'), contentType: 'video/mp4' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.asset.kind).toBe('image');
    expect(res.body.asset.contentType).toBe('image/png');
  });

  test('an unrecognised file is refused', async () => {
    const res = makeRes();
    await assetsHandler(
      req('POST', {
        email: OWNER,
        query: { package: PKG },
        body: { data: Buffer.from('not an image at all').toString('base64') },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('unsupported_media');
  });
});

describe('reading a pending package', () => {
  beforeEach(async () => {
    await upload();
  });

  test('a stranger gets an empty list, not a 403', async () => {
    // Not 403: that would advertise that hidden assets exist.
    const res = makeRes();
    await assetsHandler(req('GET', { query: { package: PKG } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assets).toEqual([]);
  });

  test('the owner sees them, flagged as pending', async () => {
    const res = makeRes();
    await assetsHandler(
      req('GET', { email: OWNER, query: { package: PKG } }),
      res
    );
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.pendingApproval).toBe(true);
  });

  test('an admin sees them', async () => {
    const res = makeRes();
    await assetsHandler(
      req('GET', { email: ADMIN, query: { package: PKG } }),
      res
    );
    expect(res.body.assets).toHaveLength(1);
  });

  test('⚠️ the RAW BYTES are refused to a stranger while pending', async () => {
    // The assertion this whole feature stands on. Hiding an asset from the
    // listing while its bytes stay reachable is not moderation.
    const list = makeRes();
    await assetsHandler(
      req('GET', { email: OWNER, query: { package: PKG } }),
      list
    );
    const id = list.body.assets[0].id;

    const res = makeRes();
    await rawHandler(req('GET', { query: { package: PKG, assetId: id } }), res);
    expect([403, 404]).toContain(res.statusCode);
    expect(res.sent).toBeUndefined();
  });

  test('the owner can fetch the raw bytes of their own pending asset', async () => {
    const list = makeRes();
    await assetsHandler(
      req('GET', { email: OWNER, query: { package: PKG } }),
      list
    );
    const id = list.body.assets[0].id;

    const res = makeRes();
    await rawHandler(
      req('GET', { email: OWNER, query: { package: PKG, assetId: id } }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('the admin decision', () => {
  beforeEach(async () => {
    await upload();
  });

  test('approve makes the assets public', async () => {
    const patch = makeRes();
    await adminPkgHandler(
      req('PATCH', {
        email: ADMIN,
        query: { packageName: PKG },
        body: { action: 'approve' },
      }),
      patch
    );
    expect(patch.statusCode).toBe(200);

    const res = makeRes();
    await assetsHandler(req('GET', { query: { package: PKG } }), res);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.state).toBe('approved');
  });

  test('decline keeps them hidden and records why', async () => {
    await adminPkgHandler(
      req('PATCH', {
        email: ADMIN,
        query: { packageName: PKG },
        body: { action: 'decline', reason: 'Third-party logo in the shot.' },
      }),
      makeRes()
    );

    const res = makeRes();
    await assetsHandler(req('GET', { query: { package: PKG } }), res);
    expect(res.body.assets).toEqual([]);

    const rec = await review.getReview(PKG);
    expect(rec.state).toBe('declined');
    expect(rec.reason).toMatch(/Third-party logo/);
    expect(rec.decidedBy).toBe(ADMIN);
  });

  test('a non-admin cannot decide', async () => {
    const res = makeRes();
    await adminPkgHandler(
      req('PATCH', {
        email: OWNER,
        query: { packageName: PKG },
        body: { action: 'approve' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('the review queue', () => {
  test('lists a package with unreviewed assets', async () => {
    await upload();
    const res = makeRes();
    await queueHandler(req('GET', { email: ADMIN }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.queue.map(q => q.package)).toContain(PKG);
    expect(res.body.queue[0].assets).toHaveLength(1);
  });

  test('a package with no assets is not in it', async () => {
    const res = makeRes();
    await queueHandler(req('GET', { email: ADMIN }), res);
    expect(res.body.queue).toEqual([]);
  });

  test('drops out once decided, and comes back on a new upload', async () => {
    // ⚠️ The decision is about the IMAGES. A package approved last month that
    // uploaded a new screenshot this morning is waiting again — otherwise the
    // first approval is a licence to publish anything afterwards.
    await upload();
    await adminPkgHandler(
      req('PATCH', {
        email: ADMIN,
        query: { packageName: PKG },
        body: { action: 'approve' },
      }),
      makeRes()
    );

    const after = makeRes();
    await queueHandler(req('GET', { email: ADMIN }), after);
    expect(after.body.queue).toEqual([]);

    await new Promise(r => setTimeout(r, 5));
    await upload();

    const again = makeRes();
    await queueHandler(req('GET', { email: ADMIN }), again);
    expect(again.body.queue.map(q => q.package)).toContain(PKG);
  });

  test('is admin-only', async () => {
    const res = makeRes();
    await queueHandler(req('GET', { email: OWNER }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/v2/packages/:package — the composite read', () => {
  test('carries metadata, the bundle and the versions', async () => {
    const res = makeRes();
    await packageHandler(req('GET', { query: { package: PKG } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.package).toBe(PKG);
    expect(res.body.metadata.name).toBe('Shots');
    expect(res.body.versions).toContain('1.0.0');
    expect(res.body.bundle.appVersion).toBe('1.0.0');
  });

  test('⚠️ applies the SAME gate as the dedicated endpoint', async () => {
    // A composite response assembles its own payload, which is exactly where
    // "something else already checked this" turns out to be false.
    await upload();
    const anon = makeRes();
    await packageHandler(req('GET', { query: { package: PKG } }), anon);
    expect(anon.body.assets).toEqual([]);

    const owner = makeRes();
    await packageHandler(
      req('GET', { email: OWNER, query: { package: PKG } }),
      owner
    );
    expect(owner.body.assets).toHaveLength(1);
  });

  test('never leaks internal metadata or the decline reason', async () => {
    await upload();
    await adminPkgHandler(
      req('PATCH', {
        email: ADMIN,
        query: { packageName: PKG },
        body: { action: 'decline', reason: 'Internal note about the owner.' },
      }),
      makeRes()
    );

    const res = makeRes();
    await packageHandler(req('GET', { query: { package: PKG } }), res);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('_ownerEmail');
    expect(body).not.toContain(OWNER);
    expect(body).not.toContain('Internal note');
    expect(res.body.review.declineReason).toBeUndefined();
  });

  test('tells the OWNER why they were declined', async () => {
    await upload();
    await adminPkgHandler(
      req('PATCH', {
        email: ADMIN,
        query: { packageName: PKG },
        body: { action: 'decline', reason: 'Third-party logo.' },
      }),
      makeRes()
    );

    const res = makeRes();
    await packageHandler(
      req('GET', { email: OWNER, query: { package: PKG } }),
      res
    );
    expect(res.body.review.state).toBe('declined');
    expect(res.body.review.declineReason).toMatch(/Third-party logo/);
  });

  test('404s for a package that does not exist', async () => {
    const res = makeRes();
    await packageHandler(
      req('GET', { query: { package: 'com.nope.nope' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
