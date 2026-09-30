/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 * PATCH /api/v2/bundles/:package/:version - edit metadata (body = full manifest;
 *   requires a logged-in user who can manage the package, plus a valid
 *   signature from one of the version's owner keys)
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  validateBundleMetadata,
  stripReservedMetadata,
  linkProblems,
} = require('@calimero-network/registry-backend/src/lib/metadata-policy');
const {
  validateBundleManifest,
} = require('@calimero-network/registry-backend/src/lib/v2-utils');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  isAllowedOwner,
} = require('#api-lib/verify');
const {
  requireAuth,
  canManagePackage,
  NOT_OWNER_MESSAGE,
} = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const {
  createBundleSanitizers,
} = require('@calimero-network/registry-backend/src/lib/bundle-sanitize');

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

let kvClient;

async function getKV() {
  if (kvClient) return kvClient;

  const isProduction = process.env.VERCEL === '1' || !!process.env.REDIS_URL;

  if (isProduction && process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', err => console.error('Redis error:', err));

    kvClient = {
      _connected: false,
      _connecting: null,
      async _ensureConnected() {
        if (this._connected) return;
        if (this._connecting) {
          await this._connecting;
          return;
        }
        this._connecting = redisClient
          .connect()
          .then(() => {
            this._connected = true;
            this._connecting = null;
          })
          .catch(error => {
            this._connected = false;
            this._connecting = null;
            throw error;
          });
        await this._connecting;
      },
      async get(key) {
        await this._ensureConnected();
        return await redisClient.get(key);
      },
    };
    return kvClient;
  }

  // Mock for development
  const mockStore = new Map();
  kvClient = {
    async get(key) {
      return mockStore.get(key) ?? null;
    },
  };
  return kvClient;
}

/** owners[] as a sorted list of strings, so order does not count as a change. */
function ownerSet(manifest) {
  const owners = Array.isArray(manifest?.owners) ? manifest.owners : [];
  return owners.map(String).sort();
}

function sameOwners(a, b) {
  const x = ownerSet(a);
  const y = ownerSet(b);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

async function handlePatch(req, res, pkg, version) {
  // A signed manifest alone is not enough: every signed manifest of a version
  // stays valid forever, so the edit also needs a logged-in account that may
  // manage this package — the same rule as delete and yank.
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'Missing body',
    });
  }
  if (body.package !== pkg || body.appVersion !== version) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'Body package and appVersion must match URL',
    });
  }

  const { valid, errors } = validateBundleManifest(body);
  if (!valid) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: errors?.join('; ') ?? 'Validation failed',
    });
  }

  try {
    await verifyManifest(body);
  } catch (err) {
    // The verifier failing to run is a server fault, not a bad signature.
    if (err?.code === 'verifier_unavailable') {
      return res.status(500).json({
        error: 'verifier_unavailable',
        message: 'Signature verification is temporarily unavailable',
      });
    }
    return res.status(400).json({
      error: 'invalid_signature',
      message: err.message || 'Signature verification failed',
    });
  }

  const store = getStorage();
  let existing;
  try {
    existing = await store.getBundleManifest(pkg, version);
  } catch (e) {
    console.error('PATCH getBundleManifest:', e);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
  if (!existing) {
    return res.status(404).json({ error: 'not_found' });
  }

  if (!(await canManagePackage(pkg, existing, user))) {
    return res.status(403).json({
      error: 'not_owner',
      message: NOT_OWNER_MESSAGE,
    });
  }

  const incomingKey = getPublicKeyFromManifest(body);
  if (!isAllowedOwner(existing, incomingKey)) {
    return res.status(403).json({
      error: 'not_owner',
      message: 'Only the package owner can edit this version.',
    });
  }

  // PATCH edits metadata; the version's owner keys are not metadata.
  if (!sameOwners(body, existing)) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'owners cannot be changed via PATCH',
    });
  }

  const badLinks = linkProblems(body.links);
  if (badLinks.length > 0) {
    return res.status(400).json({
      error: 'invalid_links',
      message: badLinks.join(' '),
      problems: badLinks,
    });
  }

  if (
    !body.wasm ||
    body.wasm.hash !== existing.wasm?.hash ||
    body.wasm.path !== existing.wasm?.path ||
    body.wasm.size !== existing.wasm?.size
  ) {
    return res.status(400).json({
      error: 'invalid_manifest',
      message: 'wasm (path, hash, size) cannot be changed via PATCH',
    });
  }

  // Server-owned metadata is not editable through PATCH. Drop every
  // `metadata._*` the client sent (a signed body would otherwise let the owner
  // set their own `_adminVerified` badge or rewrite `_ownerEmail`), then carry
  // the stored owner email and locked author forward from the existing version.
  stripReservedMetadata(body);
  body.metadata = body.metadata || {};
  if (existing.metadata && existing.metadata._ownerEmail !== undefined) {
    body.metadata._ownerEmail = existing.metadata._ownerEmail;
  }
  if (existing.metadata && existing.metadata.author !== undefined) {
    body.metadata.author = existing.metadata.author;
  } else {
    // No stored author: PATCH cannot introduce one either.
    delete body.metadata.author;
  }

  // PATCH edits metadata on an ALREADY PUBLISHED version, so this is by
  // definition not a new package: warn, never block. Blocking here would stop
  // someone fixing the description of a bundle that is grandfathered on its
  // icon. It still matters, because PATCH is a way to *remove* a description
  // or swap in a placeholder icon after the fact.
  const policy = validateBundleMetadata(body, { isNewPackage: false });
  // Only unsafe `links` block an existing package (see linkProblems): PATCH is
  // otherwise a way to swap a published app's frontend link for a script URL.
  if (policy.errors.length > 0) {
    return res.status(400).json({
      error: 'metadata_rejected',
      message: `This metadata is not accepted:\n  - ${policy.errors.join('\n  - ')}`,
      problems: policy.errors,
    });
  }

  // Top-level `_` keys are outside the signature, so anything the client puts
  // there is unsigned and unauthenticated. PATCH edits metadata only: drop
  // them all (above all `_binary`, which would replace the stored .mpk) and
  // carry the server's own stamps over from the stored version.
  const edited = {};
  for (const [k, v] of Object.entries(body)) {
    if (!k.startsWith('_')) edited[k] = v;
  }
  for (const [k, v] of Object.entries(existing)) {
    if (k.startsWith('_') && k !== '_binary') edited[k] = v;
  }

  try {
    await store.storeBundleManifest(edited, true);
    return res.status(200).json({
      message: 'Bundle metadata updated',
      package: pkg,
      version,
      ...(policy.warnings.length ? { warnings: policy.warnings } : {}),
    });
  } catch (error) {
    console.error('PATCH store Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, PATCH, DELETE, OPTIONS'
    );
    return res.status(200).end();
  }

  if (
    req.method !== 'GET' &&
    req.method !== 'PATCH' &&
    req.method !== 'DELETE'
  ) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { package: pkg, version } = req.query;
  if (!pkg || !version) {
    return res.status(400).json({ error: 'missing_params' });
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, pkg, version);
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const store = getStorage();
    let existing;
    try {
      existing = await store.getBundleManifest(pkg, version);
    } catch (e) {
      console.error('DELETE version getBundleManifest:', e);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Internal error',
      });
    }

    if (!existing) {
      return res.status(404).json({
        error: 'not_found',
        message: `Bundle ${pkg}@${version} not found`,
      });
    }

    if (!(await canManagePackage(pkg, existing, user))) {
      return res.status(403).json({
        error: 'not_owner',
        message: NOT_OWNER_MESSAGE,
      });
    }

    try {
      await store.deleteBundleVersion(pkg, version);
      // Clean up yank flag so a future re-publish of the same semver starts fresh.
      await kv.del(`bundle-yanked:${pkg}/${version}`).catch(() => {});
      return res.status(200).json({ message: `Deleted ${pkg}@${version}` });
    } catch (error) {
      console.error('DELETE version error:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Internal error',
      });
    }
  }

  // Named apart from the imported `kv`: this used to be `let kv`, which put the
  // module-level import in a temporal dead zone for the whole handler, so the
  // DELETE branch's kv.del() threw and reported 500 on a delete that had
  // already succeeded.
  let readKv;
  try {
    readKv = await getKV();
  } catch (e) {
    console.error('KV init failed:', e);
    return res.status(500).json({
      error: 'kv_init_failed',
      message: 'Internal error',
    });
  }

  // Privacy: the raw manifest carries internal `_`-prefixed metadata
  // (notably `metadata._ownerEmail`). Run it through the shared sanitizer —
  // the same one the listing endpoint and the Fastify detail route use — so
  // this response strips those fields, normalizes min_runtime_version and
  // computes the verification signals in one place.
  const { sanitizeBundle } = createBundleSanitizers(kv);

  try {
    const data = await readKv.get(`bundle:${pkg}/${version}`);
    if (!data) return res.status(404).json({ error: 'not_found' });
    const raw = JSON.parse(data).json;
    const [downloadCount, yankFlag] = await Promise.all([
      readKv.get(`downloads:${(pkg || '').toLowerCase()}`),
      readKv.get(`bundle-yanked:${pkg}/${version}`),
    ]);
    const downloads = downloadCount ? parseInt(downloadCount, 10) : 0;
    const sanitized = await sanitizeBundle(raw, pkg);
    return res.status(200).json({
      ...sanitized,
      yanked: yankFlag === '1',
      downloads,
    });
  } catch (error) {
    console.error('Get Error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
};
