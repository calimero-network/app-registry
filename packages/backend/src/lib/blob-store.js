/**
 * Blob Store — Google Cloud Storage (GCS) wrapper for bundle binaries.
 *
 * Mirrors a tiny key/value shape (putBinary / getBinary / deleteBinary) so the
 * shared BundleStorageKV class can swap the binary backing store from Redis to a
 * bucket without changing its method contract. Manifests, indexes and counters
 * stay in Redis; only the raw `.mpk` blob lives here.
 */

const { Storage } = require('@google-cloud/storage');

// Read GCS config fresh on each access (not captured at module load) so tests
// and any runtime reconfiguration that mutate process.env are picked up.
const bucketName = () => process.env.GCS_BUCKET;
const prefix = () => process.env.GCS_PREFIX || 'bundles';

/**
 * Lazily build (and cache) the GCS client + bucket handle. The cache is keyed by
 * bucket name so a changed GCS_BUCKET rebuilds rather than reusing a stale handle.
 */
let _storage;
let _bucket;
let _bucketName;

function getBucket() {
  const name = bucketName();
  if (!name) {
    throw new Error(
      'GCS_BUCKET is not set — cannot read/write bundle binaries to Google Cloud Storage'
    );
  }
  if (_bucket && _bucketName === name) return _bucket;

  // Credentials resolution order:
  // 1. Inline service-account creds via GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY
  //    (the practical option for Vercel serverless — no key file on disk).
  // 2. Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS path,
  //    workload identity, gcloud auth, etc.) when inline creds are absent.
  const options = {};
  if (process.env.GCS_PROJECT_ID) {
    options.projectId = process.env.GCS_PROJECT_ID;
  }
  if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
    options.credentials = {
      client_email: process.env.GCS_CLIENT_EMAIL,
      // Env vars flatten newlines to the literal "\n"; restore them for the PEM.
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  _storage = new Storage(options);
  _bucket = _storage.bucket(name);
  _bucketName = name;
  return _bucket;
}

const objectKey = pkgVersionKey => `${prefix()}/${pkgVersionKey}.mpk`;

/** True when a GCS error means "object not found" across SDK error shapes. */
const isNotFound = err =>
  err?.code === 404 || err?.code === '404' || err?.status === 404;

async function putBinary(pkgVersionKey, buffer) {
  await getBucket()
    .file(objectKey(pkgVersionKey))
    .save(buffer, { contentType: 'application/gzip', resumable: false });
}

async function getBinary(pkgVersionKey) {
  // returns Buffer | null
  // When the bucket isn't configured (offline/local dev), return null so callers
  // fall back to the legacy Redis copy instead of erroring on every read.
  if (!bucketName()) return null;
  try {
    const [contents] = await getBucket()
      .file(objectKey(pkgVersionKey))
      .download();
    return contents;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function deleteBinary(pkgVersionKey) {
  // Mirror getBinary: no bucket configured → nothing to delete (don't throw, so
  // callers like deleteBundleVersion can still clean up Redis + indexes).
  if (!bucketName()) return;
  await getBucket()
    .file(objectKey(pkgVersionKey))
    .delete({ ignoreNotFound: true });
}

/** Test hook: drop the cached client so a later call rebuilds from current env. */
function _resetForTests() {
  _storage = undefined;
  _bucket = undefined;
  _bucketName = undefined;
}

module.exports = {
  putBinary,
  getBinary,
  deleteBinary,
  objectKey,
  _resetForTests,
};
