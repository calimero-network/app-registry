/**
 * Push-time package identity enforcement (the production Vercel route).
 *
 * push.js used to accept any string as a `package`/`appVersion` and did not
 * reserve the Calimero namespace, so a stranger could publish `com.calimero.*`
 * (which reads as a first-party app and feeds the trusted-publisher shortcut)
 * or store an unorderable version. These lock the checks in on the real route.
 */

// Mock the kv module (backend side; storeBundleManifest lives here)
const mockKv = {
  get: jest.fn(),
  set: jest.fn(),
  setNX: jest.fn(),
  del: jest.fn(),
  sAdd: jest.fn(),
  sMembers: jest.fn(),
  sIsMember: jest.fn(),
};

jest.mock('../src/lib/kv-client', () => ({
  kv: mockKv,
}));

// Push handler uses api/lib/verify; mock so signature check passes
jest.mock('../../../api/lib/verify', () => ({
  verifyManifest: jest.fn().mockResolvedValue(undefined),
  getPublicKeyFromManifest: jest.fn().mockReturnValue('mock-pubkey'),
  isAllowedOwner: jest.fn().mockReturnValue(true),
  normalizeSignature: jest.fn(sig => sig || null),
}));

// Control the resolved (authenticated) publishing user.
let mockCurrentUser = null;
jest.mock('../../../api/lib/auth-helpers', () => {
  const actual = jest.requireActual('../../../api/lib/auth-helpers');
  return { ...actual, resolveUser: async () => mockCurrentUser };
});

const pushHandler = require('../../../api/v2/bundles/push');
const { TEST_ICON } = require('./helpers/publishable');

function makeManifest(overrides = {}) {
  return {
    version: '1.0',
    package: 'com.example.test',
    appVersion: '1.0.0',
    metadata: {
      name: 'Test App',
      description:
        'A test app used to exercise push package-policy validation.',
      author: 'Test Author',
      category: 'developer-tools',
      icon: TEST_ICON,
    },
    wasm: { path: 'app.wasm', size: 100, hash: 'abc123' },
    signature: {
      algorithm: 'ed25519',
      publicKey: 'dGVzdC1wdWJrZXk',
      signature: 'dGVzdC1zaWduYXR1cmU',
    },
    ...overrides,
  };
}

describe('Push package identity policy', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    // Publishing now requires an authenticated account (the login gate runs
    // before validation), so the default caller is a signed-in, non-staff user;
    // individual tests override this where they need anonymous or staff.
    mockCurrentUser = { email: 'stranger@example.com' };
    mockKv.get.mockResolvedValue(null);
    mockKv.setNX.mockResolvedValue(true);
    mockKv.sAdd.mockResolvedValue(1);
    mockKv.sMembers.mockResolvedValue([]); // no existing versions
    mockKv.sIsMember.mockResolvedValue(false); // not admin / not bot by default

    req = { method: 'POST', body: makeManifest(), headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
  });

  describe('package name shape', () => {
    test('rejects a name without a dot', async () => {
      req.body = makeManifest({ package: 'notreversedns' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'invalid_package_name' })
      );
    });

    test('rejects an uppercase name', async () => {
      req.body = makeManifest({ package: 'com.Example.App' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'invalid_package_name' })
      );
    });
  });

  describe('appVersion shape', () => {
    test('rejects a non-semver version', async () => {
      req.body = makeManifest({ appVersion: '1.0' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'invalid_version' })
      );
    });
  });

  describe('reserved Calimero prefix', () => {
    test('an anonymous publish is refused by the login gate before anything else', async () => {
      mockCurrentUser = null;
      req.body = makeManifest({ package: 'com.calimero.sneaky' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('rejects a signed-in non-staff publish of a com.calimero.* package', async () => {
      mockCurrentUser = { email: 'stranger@example.com' };
      req.body = makeManifest({ package: 'com.calimero.sneaky' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'reserved_prefix' })
      );
    });

    test('rejects a non-staff publish of a network.calimero.* package', async () => {
      mockCurrentUser = { email: 'stranger@example.com' };
      req.body = makeManifest({ package: 'network.calimero.sneaky' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'reserved_prefix' })
      );
    });

    test('allows a staff publish of a com.calimero.* package', async () => {
      mockCurrentUser = { email: 'fran@calimero.network' };
      req.body = makeManifest({ package: 'com.calimero.official' });
      await pushHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    // The reservation applies to CREATING a reserved-prefix package, never to
    // re-publishing an EXISTING one — otherwise every first-party package (all
    // com.calimero.*) would stop releasing unless each publish carried a staff
    // identity. An existing package is governed by the owner check instead.
    test('allows a non-staff OWNER to publish a new version of an existing com.calimero.* package', async () => {
      mockCurrentUser = { email: 'owner@example.com' };
      mockKv.sMembers.mockResolvedValue(['1.0.0']); // package already exists
      req.body = makeManifest({
        package: 'com.calimero.chat',
        appVersion: '2.0.0',
      });
      await pushHandler(req, res);
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'reserved_prefix' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
