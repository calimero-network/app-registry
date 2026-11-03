/**
 * Serve Bundle Artifacts
 * GET /api/artifacts/:package/:version/:filename
 * Also accessible via rewrite: /artifacts/:package/:version/:filename
 *
 * This is the URL Calimero nodes install from:
 * `{registry-url}/artifacts/{pkg}/{ver}/{pkg}-{ver}.mpk`, ONE GET, redirects
 * refused, credentials (if any) only as basic auth from the URL's userinfo.
 *
 * Public packages: open, exactly as before.
 * Private packages (see api/lib/package-records.js) need one of:
 *   - `Authorization: Basic <cluster_user:token>` that the Cloud manager's
 *     authorize endpoint accepts for the package's Cloud org;
 *   - `Authorization: Bearer <Cloud JWT>` with the `read` scope for that org;
 *   - a registry session/API token of someone who may read the package.
 * Anything else gets the same 404 as a package that does not exist.
 *
 * ⚠️ STREAMED, NOT BUFFERED. The .mpk is piped from GCS to the response with
 * a Content-Length from the object's metadata. It used to be downloaded
 * whole, hex-encoded and decoded again (three copies in memory) and returned
 * as one body, which also put it under Vercel's 4.5 MB non-streaming response
 * limit. See docs/cloud-integration.md, "Large files".
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const blob = require('@calimero-network/registry-backend/src/lib/blob-store');
const { kv } = require('@calimero-network/registry-backend/src/lib/kv-client');
const { resolveUser } = require('#api-lib/auth-helpers');
const {
  getPackageRecord,
  visibilityOf,
  canReadPrivate,
} = require('#api-lib/package-records');
const { getOrg } = require('#api-lib/org-storage');
const {
  authorizeDownload,
  parseBasicAuth,
  AuthorizeUnavailableError,
} = require('#api-lib/cloud-authorize');

// Singleton storage instance
let storage;

function getStorage() {
  if (!storage) {
    storage = new BundleStorageKV();
  }
  return storage;
}

/**
 * Drop internal `_`-prefixed metadata keys (e.g. `_ownerEmail`) from a manifest
 * before it is returned to a client. The full bundle sanitizer is the canonical
 * path, but this endpoint only echoes a manifest on a rare 409, so a targeted
 * strip keeps the diagnostic dependency-free.
 */
function stripInternalMetadata(manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.metadata) {
    return manifest;
  }
  const metadata = {};
  for (const [key, value] of Object.entries(manifest.metadata)) {
    if (!key.startsWith('_')) metadata[key] = value;
  }
  return { ...manifest, metadata };
}

/**
 * May this request download private package `pkg@version`?
 * @returns {Promise<boolean>} throws AuthorizeUnavailableError when the Cloud
 *   manager cannot be asked.
 */
async function mayDownloadPrivate(req, pkg, version, record) {
  const header = req.headers?.authorization;
  const basic = parseBasicAuth(header);
  if (basic) {
    if (!record?.org_id) return false;
    const org = await getOrg(record.org_id);
    if (!org?.cloud_org_id) return false;
    const answer = await authorizeDownload({
      clusterUser: basic.user,
      token: basic.pass,
      pkg,
      version,
      org: org.cloud_org_id,
    });
    // mdma vouches for the credential and names the cluster's org; the
    // registry decides whether that org owns this package.
    return answer.allowed && answer.orgId === org.cloud_org_id;
  }
  const user = await resolveUser(req, { allowCloud: true }).catch(() => null);
  return canReadPrivate(user, record);
}

/** Pipe `stream` into `res`, resolving when the response has finished. */
function pipeTo(stream, res) {
  return new Promise((resolve, reject) => {
    stream.on('error', err => {
      // Headers (and possibly bytes) are already out: the only honest signal
      // left is to cut the connection so the client sees a short read.
      if (typeof res.destroy === 'function') res.destroy(err);
      reject(err);
    });
    res.on?.('finish', resolve);
    res.on?.('close', resolve);
    stream.pipe(res);
  });
}

module.exports = async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel passes dynamic route params via req.query
  // For file structure [package]/[version]/[filename].js
  // Parameters are: req.query.package, req.query.version, req.query.filename
  let pkg = req.query?.package;
  let version = req.query?.version;
  let filename = req.query?.filename;

  // If parameters are missing or contain literal "$package" (Vercel rewrite issue),
  // parse from URL path
  if (!pkg || !version || pkg === '$package' || version === '$version') {
    // Strip query string from URL path before matching
    const urlPath = (req.url || '').split('?')[0];
    // Match both /api/artifacts/... and /artifacts/... patterns
    // Also handle cases where the URL might be the rewritten path
    const match = urlPath.match(
      /\/(?:api\/)?artifacts\/([^/]+)\/([^/]+)\/([^/]+)/
    );
    if (match) {
      // Only use parsed values if query params are missing or invalid
      if (!pkg || pkg === '$package') pkg = match[1];
      if (!version || version === '$version') version = match[2];
      if (!filename || filename === '$filename') filename = match[3];
    }
  }

  if (!pkg || !version || pkg === '$package' || version === '$version') {
    return res.status(400).json({
      error: 'missing_params',
      message: `Missing package or version parameter. Received: package=${pkg || 'undefined'}, version=${version || 'undefined'}`,
      debug: {
        query: req.query,
        url: req.url,
      },
    });
  }

  const notFound = () =>
    res.status(404).json({
      error: 'artifact_not_found',
      message: `${pkg}@${version} not found`,
    });

  try {
    const record = await getPackageRecord(pkg);
    const isPrivate = visibilityOf(record) === 'private';
    if (isPrivate) {
      // Never let a shared cache keep a private package, nor serve it back.
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      let allowed;
      try {
        allowed = await mayDownloadPrivate(req, pkg, version, record);
      } catch (err) {
        if (!(err instanceof AuthorizeUnavailableError)) throw err;
        console.error('artifact authorize unavailable:', err.message);
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          error: 'authorize_unavailable',
          message: 'Download authorization is temporarily unavailable',
        });
      }
      if (!allowed) return notFound();
    }

    const store = getStorage();
    const manifest = await store.getBundleManifest(pkg, version);
    if (!manifest) return notFound();

    // Expose min_runtime_version for runtime compatibility (Rust expects this)
    const minRuntimeVersion =
      manifest?.minRuntimeVersion ?? manifest?.min_runtime_version;
    const minRuntimeVersionHeader =
      minRuntimeVersion != null && String(minRuntimeVersion).trim()
        ? String(minRuntimeVersion).trim()
        : '0.1.0';

    // SECURITY: `filename` comes from the URL. A raw quote or control char would
    // break out of the quoted header value (header injection). Strip anything
    // that is not a safe filename char, and fall back to a fixed pattern if
    // nothing usable remains.
    const safeFilename =
      String(filename || '')
        .replace(/[^A-Za-z0-9._-]/g, '')
        .slice(0, 128) ||
      `${pkg}-${version}.mpk`.replace(/[^A-Za-z0-9._-]/g, '');
    const sendHeaders = length => {
      res.setHeader('X-Min-Runtime-Version', minRuntimeVersionHeader);
      res.setHeader('Content-Type', 'application/gzip'); // MPK is a Gzip compressed tarball
      res.setHeader('Content-Length', length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"`
      );
    };

    const key = `${pkg}/${version}`;
    const opened = await blob.openBinaryStream(key);
    if (opened && Number.isFinite(opened.size)) {
      sendHeaders(opened.size);
      res.status(200);
      await pipeTo(opened.stream, res);
      return undefined;
    }

    // Legacy bundles whose binary still lives in Redis (hex). These predate
    // GCS and are small; they are served from memory as before.
    const binaryHex = await kv.get(`binary:${key}`);
    if (!binaryHex) {
      // Privacy: this diagnostic returns the stored manifest, which carries
      // internal `_`-prefixed metadata (notably `metadata._ownerEmail`). Strip
      // those before responding so the account email never leaks on this path.
      return res.status(409).json({
        error: 'binary_missing',
        message: `Manifest for ${pkg}@${version} exists but binary was never uploaded. Re-publish the bundle.`,
        manifest: stripInternalMetadata(manifest),
      });
    }
    const binary = Buffer.from(binaryHex, 'hex');
    sendHeaders(binary.length);
    return res.status(200).send(binary);
  } catch (error) {
    console.error('Error serving artifact:', error);
    if (res.headersSent) return undefined;
    return res.status(500).json({
      error: 'internal_error',
      message: 'Internal error',
    });
  }
};
