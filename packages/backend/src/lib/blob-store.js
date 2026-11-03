/**
 * Blob Store — Google Cloud Storage (GCS) wrapper for bundle binaries.
 *
 * Mirrors a tiny key/value shape (putBinary / getBinary / deleteBinary) so the
 * shared BundleStorageKV class can swap the binary backing store from Redis to a
 * bucket without changing its method contract. Manifests, indexes and counters
 * stay in Redis; only the raw `.mpk` blob lives here.
 */

const { Storage } = require('@google-cloud/storage');
const { storageVar } = require('@calimero-network/registry-shared/storage-env');

// Read GCS config fresh on each access (not captured at module load) so tests
// and any runtime reconfiguration that mutate process.env are picked up.
const bucketName = () => storageVar('GCS_BUCKET');
const prefix = () => process.env.GCS_PREFIX || 'bundles';

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const UPLOAD_CONTENT_TYPE = 'application/gzip';

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
  if (storageVar('GCS_PROJECT_ID')) {
    options.projectId = storageVar('GCS_PROJECT_ID');
  }
  if (storageVar('GCS_CLIENT_EMAIL') && storageVar('GCS_PRIVATE_KEY')) {
    options.credentials = {
      client_email: storageVar('GCS_CLIENT_EMAIL'),
      // Env vars flatten newlines to the literal "\n"; restore them for the PEM.
      private_key: storageVar('GCS_PRIVATE_KEY').replace(/\\n/g, '\n'),
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

/** Thrown by putBinary({createOnly}) when the object already exists. */
class BlobExistsError extends Error {
  constructor(key) {
    super(`Blob ${key} already exists`);
    this.name = 'BlobExistsError';
    this.code = 'blob_exists';
  }
}

/** GCS answers a failed `ifGenerationMatch` precondition with 412. */
const isPreconditionFailed = err =>
  err?.code === 412 || err?.code === '412' || err?.status === 412;

/**
 * Write a bundle binary. Resolves with the new object's generation.
 *
 * With `createOnly`, the write carries `ifGenerationMatch: 0`, so GCS refuses
 * it atomically when an object is already there (BlobExistsError). Published
 * binaries are immutable; only an explicit overwrite may replace one.
 */
async function putBinary(pkgVersionKey, buffer, { createOnly = false } = {}) {
  const file = getBucket().file(objectKey(pkgVersionKey));
  try {
    await file.save(buffer, {
      contentType: 'application/gzip',
      resumable: false,
      ...(createOnly ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
    });
  } catch (err) {
    if (createOnly && isPreconditionFailed(err)) {
      throw new BlobExistsError(objectKey(pkgVersionKey));
    }
    throw err;
  }
  return file.metadata?.generation ?? null;
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

/**
 * Open a bundle binary as a stream, for serving without buffering it.
 *
 * Resolves `{ stream, size, generation }`, or null when the bucket is not
 * configured or the object does not exist (callers then fall back to the
 * legacy Redis copy). The read is pinned to the generation the metadata
 * reported, so `size` (sent as Content-Length) always matches the bytes
 * streamed even if the object were replaced mid-download.
 */
async function openBinaryStream(pkgVersionKey) {
  if (!bucketName()) return null;
  const file = getBucket().file(objectKey(pkgVersionKey));
  let meta;
  try {
    [meta] = await file.getMetadata();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  const generation = meta?.generation ?? null;
  const pinned = generation
    ? getBucket().file(objectKey(pkgVersionKey), { generation })
    : file;
  return {
    stream: pinned.createReadStream(),
    size: Number(meta?.size),
    generation,
  };
}

async function deleteBinary(pkgVersionKey, { ifGeneration } = {}) {
  // Mirror getBinary: no bucket configured → nothing to delete (don't throw, so
  // callers like deleteBundleVersion can still clean up Redis + indexes).
  if (!bucketName()) return;
  // `ifGeneration` deletes only that exact object version, so undoing our own
  // write can never remove a blob someone else wrote in the meantime.
  await getBucket()
    .file(objectKey(pkgVersionKey))
    .delete({
      ignoreNotFound: true,
      ...(ifGeneration ? { ifGenerationMatch: ifGeneration } : {}),
    });
}

/** Thrown by getUpload when a staged object exceeds MAX_BUNDLE_BYTES. */
class UploadTooLargeError extends Error {
  constructor() {
    super(`Upload exceeds ${MAX_BUNDLE_BYTES} bytes`);
    this.name = 'UploadTooLargeError';
  }
}

/**
 * V4 signed PUT for a staging object. The size cap is a signed extension
 * header, so GCS itself refuses a larger body; the client must replay `headers`.
 */
async function signedUploadUrl(object) {
  const headers = {
    'Content-Type': UPLOAD_CONTENT_TYPE,
    'x-goog-content-length-range': `0,${MAX_BUNDLE_BYTES}`,
  };
  const expires = Date.now() + UPLOAD_URL_TTL_MS;
  const [url] = await getBucket()
    .file(object)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType: UPLOAD_CONTENT_TYPE,
      extensionHeaders: {
        'x-goog-content-length-range': headers['x-goog-content-length-range'],
      },
    });
  return {
    url,
    method: 'PUT',
    headers,
    expiresAt: new Date(expires).toISOString(),
  };
}

/** Staged upload as a Buffer, or null when missing. Throws UploadTooLargeError. */
async function getUpload(object) {
  const file = getBucket().file(object);
  try {
    const [meta] = await file.getMetadata();
    if (Number(meta.size) > MAX_BUNDLE_BYTES) throw new UploadTooLargeError();
    const [contents] = await file.download();
    return contents;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function deleteUpload(object) {
  await getBucket().file(object).delete({ ignoreNotFound: true });
}

/** Test hook: drop the cached client so a later call rebuilds from current env. */
function _resetForTests() {
  _storage = undefined;
  _bucket = undefined;
  _bucketName = undefined;
}

module.exports = {
  BlobExistsError,
  UploadTooLargeError,
  MAX_BUNDLE_BYTES,
  signedUploadUrl,
  getUpload,
  deleteUpload,
  putBinary,
  getBinary,
  openBinaryStream,
  deleteBinary,
  objectKey,
  _resetForTests,
};
