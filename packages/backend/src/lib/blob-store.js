/**
 * Blob Store — Google Cloud Storage (GCS) wrapper for bundle binaries.
 *
 * Mirrors a tiny key/value shape (putBinary / getBinary / deleteBinary) so the
 * shared BundleStorageKV class can swap the binary backing store from Redis to a
 * bucket without changing its method contract. Manifests, indexes and counters
 * stay in Redis; only the raw `.mpk` blob lives here.
 */

const { Storage } = require('@google-cloud/storage');

const BUCKET = process.env.GCS_BUCKET;
const PREFIX = process.env.GCS_PREFIX || 'bundles';

/**
 * Build the GCS client lazily so importing this module never throws when the
 * bucket isn't configured (e.g. unit tests, or routes that never touch binaries).
 */
let _storage;
let _bucket;

function getBucket() {
  if (_bucket) return _bucket;

  if (!BUCKET) {
    throw new Error(
      'GCS_BUCKET is not set — cannot read/write bundle binaries to Google Cloud Storage'
    );
  }

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
  _bucket = _storage.bucket(BUCKET);
  return _bucket;
}

const objectKey = pkgVersionKey => `${PREFIX}/${pkgVersionKey}.mpk`;

async function putBinary(pkgVersionKey, buffer) {
  await getBucket()
    .file(objectKey(pkgVersionKey))
    .save(buffer, { contentType: 'application/gzip', resumable: false });
}

async function getBinary(pkgVersionKey) {
  // returns Buffer | null
  // When the bucket isn't configured (offline/local dev), return null so callers
  // fall back to the legacy Redis copy instead of erroring on every read.
  if (!BUCKET) return null;
  try {
    const [contents] = await getBucket()
      .file(objectKey(pkgVersionKey))
      .download();
    return contents;
  } catch (err) {
    if (err?.code === 404) return null;
    throw err;
  }
}

async function deleteBinary(pkgVersionKey) {
  await getBucket()
    .file(objectKey(pkgVersionKey))
    .delete({ ignoreNotFound: true });
}

module.exports = { putBinary, getBinary, deleteBinary, objectKey };
