/**
 * V2 Bundle Push-File API (multipart .mpk upload)
 * POST /api/v2/bundles/push-file
 * Accepts a multipart/form-data request with a "bundle" field containing a .mpk file.
 * Extracts manifest.json from the .mpk archive, verifies signature, and stores in KV.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const busboy = require('busboy');
const tar = require('tar');
const semver = require('semver');
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  verifyManifest,
  getPublicKeyFromManifest,
  normalizeSignature,
} = require('../../lib/verify');
const { isAllowedToPublish } = require('../../lib/org-storage');
const { resolveUser } = require('../../lib/auth-helpers');
const { getUserByEmail } = require('../../lib/user-storage');

// Disable Vercel's default body parser so we can handle multipart ourselves
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

/**
 * Parse multipart/form-data and return the first file buffer + filename.
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { fileSize: 100 * 1024 * 1024 },
      });
    } catch (err) {
      return reject(new Error('Invalid multipart request: ' + err.message));
    }

    let found = false;
    bb.on('file', (_fieldname, file, info) => {
      if (found) {
        file.resume();
        return;
      }
      found = true;
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end', () =>
        resolve({ buffer: Buffer.concat(chunks), filename: info.filename })
      );
      file.on('error', reject);
    });

    bb.on('error', reject);
    bb.on('finish', () => {
      if (!found) reject(new Error('No file found in multipart upload'));
    });

    req.pipe(bb);
  });
}

/**
 * Find manifest.json recursively in a directory.
 */
function findManifest(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === 'manifest.json') return full;
    if (e.isDirectory()) {
      const r = findManifest(full);
      if (r) return r;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  let tempDir;
  try {
    // Parse multipart
    let buffer, filename;
    try {
      ({ buffer, filename } = await parseMultipart(req));
    } catch (err) {
      return res
        .status(400)
        .json({ error: 'invalid_request', message: err.message });
    }

    if (!filename || !filename.toLowerCase().endsWith('.mpk')) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'File must be a .mpk bundle.',
      });
    }

    // Write to /tmp and extract
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-push-'));
    const mpkPath = path.join(tempDir, 'bundle.mpk');
    fs.writeFileSync(mpkPath, buffer);

    await tar.x({
      file: mpkPath,
      gzip: true,
      cwd: tempDir,
      filter: name => path.basename(name) === 'manifest.json',
    });

    const manifestPath = findManifest(tempDir);
    if (!manifestPath) {
      return res.status(400).json({
        error: 'invalid_bundle',
        message: 'Bundle must contain manifest.json.',
      });
    }

    const bundleManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Validate required fields
    if (!bundleManifest?.package || !bundleManifest?.appVersion) {
      return res.status(400).json({
        error: 'invalid_manifest',
        message: 'Missing required fields: package, appVersion',
      });
    }

    // Require signature
    const sig = normalizeSignature(bundleManifest?.signature);
    if (!sig) {
      return res.status(400).json({
        error: 'missing_signature',
        message: 'Missing signature. All publishes require a valid signature.',
      });
    }

    // Verify signature
    try {
      await verifyManifest(bundleManifest);
    } catch (err) {
      return res.status(400).json({
        error: 'invalid_signature',
        message: err.message || 'Signature verification failed',
      });
    }

    // Resolve user from session cookie or bearer token
    const user = await resolveUser(req);

    // Look up username so we never store emails as the public author
    let displayAuthor = null;
    let ownerEmail = null;
    if (user?.email) {
      ownerEmail = user.email;
      const profile = await getUserByEmail(user.email);
      displayAuthor = profile?.username || user.email;
    }

    const store = getStorage();
    const incomingKey = getPublicKeyFromManifest(bundleManifest);
    const versions = await store.getBundleVersions(bundleManifest.package);

    bundleManifest.metadata = bundleManifest.metadata || {};

    if (versions.length > 0) {
      // Preserve author from oldest version (locked to first publisher)
      const oldestVersion = versions[versions.length - 1];
      const latestVersion = versions[0];
      const manifestOldest = await store.getBundleManifest(
        bundleManifest.package,
        oldestVersion
      );
      const existingAuthor = manifestOldest?.metadata?.author;
      if (existingAuthor) {
        bundleManifest.metadata.author = existingAuthor;
        bundleManifest.metadata._ownerEmail =
          manifestOldest?.metadata?._ownerEmail || existingAuthor;
      } else if (displayAuthor) {
        bundleManifest.metadata.author = displayAuthor;
        bundleManifest.metadata._ownerEmail = ownerEmail;
      }

      // Check ownership (key match or org membership)
      const manifestLatest = await store.getBundleManifest(
        bundleManifest.package,
        latestVersion
      );
      const allowed = await isAllowedToPublish(
        manifestLatest,
        incomingKey,
        bundleManifest.package,
        user?.email
      );
      if (!allowed) {
        return res.status(403).json({
          error: 'not_owner',
          message:
            'Only the package owner or an organization member can publish new versions.',
        });
      }

      // New version must be greater than latest
      const incoming = bundleManifest.appVersion;
      if (
        semver.valid(incoming) &&
        semver.valid(latestVersion) &&
        semver.lte(incoming, latestVersion)
      ) {
        return res.status(400).json({
          error: 'version_not_allowed',
          message: `New version (${incoming}) must be greater than latest (${latestVersion}).`,
        });
      }
    } else if (displayAuthor) {
      // New package — set author to username, store email privately
      bundleManifest.metadata.author = displayAuthor;
      bundleManifest.metadata._ownerEmail = ownerEmail;
    }

    const overwrite =
      process.env.ALLOW_BUNDLE_OVERWRITE === 'true' ||
      process.env.ALLOW_BUNDLE_OVERWRITE === '1';

    bundleManifest._binary = buffer.toString('hex');
    await store.storeBundleManifest(bundleManifest, overwrite);

    return res.status(201).json({
      message: 'Bundle published successfully',
      package: bundleManifest.package,
      version: bundleManifest.appVersion,
    });
  } catch (err) {
    console.error('push-file error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: err?.message ?? String(err) });
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch (_) {
        // ignore cleanup errors
      }
    }
  }
};
