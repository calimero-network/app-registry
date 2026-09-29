/**
 * PATCH /api/v2/bundles/:pkg/:version edits metadata. It used to pass the raw
 * body to storeBundleManifest(body, true) — `_binary` included — so a replayed
 * signed manifest could overwrite the stored .mpk and answer 200. Top-level
 * `_` keys are outside the signature: PATCH must drop every one of them and
 * keep the server's own stamps.
 */

const mockKVData = new Map();
const mockKv = {
  get: jest.fn(async k => mockKVData.get(k) ?? null),
  set: jest.fn(async (k, v) => {
    mockKVData.set(k, v);
    return 'OK';
  }),
  setNX: jest.fn(),
  sAdd: jest.fn(async () => 1),
  sMembers: jest.fn(async () => []),
  del: jest.fn(),
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

// PATCH needs a logged-in account that can manage the package; that rule has
// its own suite (bundle-metadata-edit.test.js).
jest.mock('../../../api/lib/auth-helpers', () => ({
  requireAuth: jest.fn(async () => ({ email: 'owner@example.com' })),
  canManagePackage: jest.fn(async () => true),
  NOT_OWNER_MESSAGE: 'not owner',
}));

const blob = require('../src/lib/blob-store');
const handler = require('../../../api/v2/bundles/[package]/[version]');

const stored = {
  version: '1.0',
  package: 'com.example.app',
  appVersion: '1.0.0',
  metadata: { name: 'App', description: 'An app.' },
  wasm: { path: 'app.wasm', hash: 'a'.repeat(64), size: 10 },
  signature: { algorithm: 'ed25519', publicKey: 'owner-key', signature: 's' },
  _publishedAt: '2026-01-01T00:00:00.000Z',
  _installSize: 1234,
};

function res() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
}

test('PATCH never stores a client binary or client server-stamps', async () => {
  mockKVData.set(
    'bundle:com.example.app/1.0.0',
    JSON.stringify({ json: stored })
  );
  const r = res();
  await handler(
    {
      method: 'PATCH',
      query: { package: 'com.example.app', version: '1.0.0' },
      headers: {},
      body: {
        ...stored,
        metadata: { name: 'App', description: 'Edited.' },
        _binary: 'deadbeef',
        _publishedAt: 'forged',
        _installSize: 1,
      },
    },
    r
  );

  expect(r.status).toHaveBeenCalledWith(200);
  expect(blob.putBinary).not.toHaveBeenCalled();
  const saved = JSON.parse(mockKVData.get('bundle:com.example.app/1.0.0')).json;
  expect(saved._binary).toBeUndefined();
  expect(saved._publishedAt).toBe(stored._publishedAt);
  expect(saved._installSize).toBe(stored._installSize);
  expect(saved.metadata.description).toBe('Edited.');
});
