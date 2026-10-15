/**
 * Record a download (public endpoint).
 * POST /api/v2/downloads/record
 * Body: { "package": "com.example.app", "version": "1.0.0" } (version optional)
 *
 * Increments Redis: downloads:total, downloads:<package>
 * No auth; call after a successful artifact download/install.
 *
 * Only published packages (and, when given, published versions) are counted,
 * using the same name/version rules as publishing.
 * A client (an IPv6 client is its /64) is counted at most once per package per
 * hour, whatever the version; repeats still answer 200.
 */

const { kv } = require('#api-lib/kv-client');
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  countDownload,
} = require('@calimero-network/registry-backend/src/lib/download-count');
const {
  isValidPackageName,
  isValidPackageVersion,
} = require('@calimero-network/registry-backend/src/lib/metadata-policy');

const MAX_BODY_BYTES = 1024;
const MAX_PACKAGE_LENGTH = 255;
const MAX_VERSION_LENGTH = 128;

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

function clientIp(req) {
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim();
  if (first) return first;
  const real = headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return req.socket?.remoteAddress || 'unknown';
}

function badRequest(res, message) {
  return res.status(400).json({ error: 'invalid_request', message });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res
      .status(413)
      .json({ error: 'payload_too_large', message: 'Request body too large' });
  }

  const body =
    typeof req.body === 'object' &&
    req.body !== null &&
    !Array.isArray(req.body)
      ? req.body
      : {};

  const packageName = body.package ?? body.pkg;
  if (!packageName || typeof packageName !== 'string') {
    return badRequest(res, 'Missing or invalid "package" in body');
  }

  // Lowercase so the key matches canonical lookups in bundle endpoints.
  const pkg = packageName.trim().toLowerCase();
  if (pkg.length > MAX_PACKAGE_LENGTH || !isValidPackageName(pkg)) {
    return badRequest(res, 'Invalid package name format');
  }

  let version = null;
  if (body.version !== undefined && body.version !== null) {
    if (
      typeof body.version !== 'string' ||
      body.version.length > MAX_VERSION_LENGTH ||
      !isValidPackageVersion(body.version)
    ) {
      return badRequest(res, 'Invalid "version" in body');
    }
    version = body.version;
  }

  try {
    const store = getStorage();
    const exists = version
      ? await store.bundleExists(pkg, version)
      : (await store.getBundleVersions(pkg)).length > 0;
    if (!exists) {
      return res.status(404).json({
        error: 'not_found',
        message: version ? 'Version not found' : 'Package not found',
      });
    }

    if (await countDownload(kv, clientIp(req), pkg)) {
      console.log('Download recorded', { package: pkg, version });
    }
    return res.status(200).json({ ok: true, package: pkg });
  } catch (error) {
    console.error('Record download error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
