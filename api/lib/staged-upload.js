/**
 * Resolves a push's `_upload` reference (a staging object the client PUT
 * straight to storage) into the `_binary` hex the push handler already verifies.
 */

const crypto = require('crypto');
const {
  getUpload,
  UploadTooLargeError,
} = require('@calimero-network/registry-backend/src/lib/blob-store');

const UUID_V4 =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const refusal = (status, error, message) => ({
  refusal: { status, body: { error, message } },
});

/**
 * Mutates the manifest: `_upload` becomes `_binary`. Returns `{ object }` once
 * downloaded, `{}` when no `_upload` was sent, or `{ refusal }` to send as-is.
 */
async function resolveStagedUpload(manifest, email) {
  if (manifest._upload === undefined) return {};
  if (manifest._binary !== undefined) {
    return refusal(
      400,
      'invalid_upload',
      'Send either _binary or _upload, not both.'
    );
  }
  const owner = crypto.createHash('sha256').update(email).digest('hex');
  const object = manifest._upload?.object;
  // The pattern pins the caller's own hash directory, so it is the ownership check.
  if (
    typeof object !== 'string' ||
    !new RegExp(`^uploads/${owner}/${UUID_V4}\\.mpk$`).test(object)
  ) {
    return refusal(
      400,
      'invalid_upload',
      '_upload.object must be an object from your own /upload-url.'
    );
  }
  let bytes;
  try {
    bytes = await getUpload(object);
  } catch (err) {
    if (!(err instanceof UploadTooLargeError)) throw err;
    return { object, ...refusal(413, 'payload_too_large', err.message) };
  }
  if (!bytes) {
    return refusal(
      400,
      'upload_not_found',
      'No uploaded bundle at _upload.object; PUT it to the url from /upload-url first.'
    );
  }
  manifest._binary = bytes.toString('hex');
  delete manifest._upload;
  return { object };
}

module.exports = { resolveStagedUpload };
