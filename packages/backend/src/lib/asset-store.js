'use strict';

/**
 * Package assets — screenshots and video shown on an app's page.
 *
 * WHY THIS IS NOT PART OF THE BUNDLE
 *
 * The bundle manifest is signed. `removeTransientFields` (lib/verify.js) only
 * strips top-level `_`-prefixed keys before verification, so anything added to
 * the manifest either breaks the signature or has to be smuggled through an
 * underscore. More importantly, the whole point of assets is that a publisher
 * can change them **without republishing** — a signed field cannot do that.
 *
 * So assets are registry-side state keyed by package: bytes in GCS, an ordered
 * index in Redis.
 *
 * ⚠️ THE BYTES LIVE UNDER THEIR OWN PREFIX, NEVER THE BUNDLE ONE.
 * The registry must serve a `.mpk` byte for byte — `bytecode_id` covers the
 * whole envelope, so anything that rewrites, re-gzips or renames inside the
 * bundle prefix changes the blob id, every node then fails its check, and the
 * fleet silently stops upgrading. `GCS_ASSET_PREFIX` is separate and defaults
 * to `assets`, distinct from `GCS_PREFIX`'s `bundles`.
 *
 * ⚠️ DELETE ACTUALLY DELETES.
 * Package delete in this repo already leaves `.mpk` blobs publicly readable —
 * a known won't-fix. Repeating that shape here would ship the same leak with
 * user-uploaded images in it, so `removeAsset` removes the object and only
 * then drops the index entry.
 */

const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');
const { kv } = require('./kv-client');

const bucketName = () => process.env.GCS_BUCKET;
const assetPrefix = () => process.env.GCS_ASSET_PREFIX || 'assets';

/** Redis key holding a package's ordered asset index. */
const indexKey = pkg => `pkg-assets:${pkg}`;

/** GCS object path. Separate prefix from bundles — see the header. */
const assetKey = (pkg, id, ext) =>
  `${assetPrefix()}/${pkg}/${id}${ext ? `.${ext}` : ''}`;

const MAX_ASSETS = 8;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;

/**
 * Accepted types, by magic bytes.
 *
 * A `Content-Type` header is supplied by the uploader and therefore proves
 * nothing; trusting it is how an "image" ends up being served as HTML. Each
 * entry is [extension, kind, matcher over the first bytes].
 */
const SIGNATURES = [
  [
    'png',
    'image',
    b =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ],
  ['jpg', 'image', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  [
    'webp',
    'image',
    b =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  ],
  ['gif', 'image', b => b.subarray(0, 6).toString('ascii').startsWith('GIF8')],
  // ISO-BMFF: 'ftyp' at offset 4 covers mp4 and the m4v/mov family.
  ['mp4', 'video', b => b.subarray(4, 8).toString('ascii') === 'ftyp'],
  [
    'webm',
    'video',
    b => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  ],
];

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Identify a buffer by its own bytes.
 * @returns {{ext: string, kind: 'image'|'video', contentType: string}|null}
 */
function sniff(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  for (const [ext, kind, match] of SIGNATURES) {
    if (match(buffer)) {
      return { ext, kind, contentType: CONTENT_TYPES[ext] };
    }
  }
  return null;
}

let _storage;
let _bucket;
let _bucketName;

function getBucket() {
  const name = bucketName();
  if (!name) throw new Error('GCS_BUCKET is not set — cannot store assets');
  if (_bucket && _bucketName === name) return _bucket;

  const options = {};
  if (process.env.GCS_PROJECT_ID)
    options.projectId = process.env.GCS_PROJECT_ID;
  if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
    options.credentials = {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  _storage = new Storage(options);
  _bucket = _storage.bucket(name);
  _bucketName = name;
  return _bucket;
}

const isNotFound = err =>
  err?.code === 404 || err?.code === '404' || err?.status === 404;

/** The package's asset index, oldest first. Always an array. */
async function listAssets(pkg) {
  const raw = await kv.get(indexKey(pkg));
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveIndex(pkg, assets) {
  await kv.set(indexKey(pkg), JSON.stringify(assets));
}

/**
 * Store one asset and append it to the package's index.
 *
 * ⚠️ THE THUMBNAIL IS OPTIONAL AND UNTRUSTED.
 *
 * There is no image library in this runtime — adding `sharp` to resize
 * server-side would pull a platform-specific native binary into every
 * serverless function, including the ones that never touch an image. So the
 * downscale happens in the browser, which already has the decoded bitmap in
 * hand, and arrives here as a second buffer.
 *
 * That makes it caller-supplied bytes, so it is sniffed exactly like the
 * original and rejected unless it is genuinely an image — otherwise "thumb"
 * becomes a way to store an arbitrary blob under a package's prefix and have
 * the registry serve it with an image Content-Type.
 *
 * A missing or rejected thumbnail is not an error: the asset stores fine and
 * `thumbKey` stays unset, which every reader treats as "serve the original".
 * That is also what the assets uploaded before this existed do.
 *
 * @returns {{ok: true, asset: object} | {ok: false, error: string, message: string}}
 */
async function addAsset(
  pkg,
  buffer,
  { alt = '', thumb = null, width = null, height = null } = {}
) {
  const kind = sniff(buffer);
  if (!kind) {
    return {
      ok: false,
      error: 'unsupported_media',
      message:
        'Unrecognised file. Supported: PNG, JPEG, WebP, GIF, MP4, WebM. The type is read from the file itself, not from its name or Content-Type.',
    };
  }

  const cap = kind.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > cap) {
    return {
      ok: false,
      error: 'too_large',
      message: `${kind.kind} is ${buffer.length} bytes; the limit is ${cap}.`,
    };
  }

  const existing = await listAssets(pkg);
  if (existing.length >= MAX_ASSETS) {
    return {
      ok: false,
      error: 'too_many',
      message: `A package may have at most ${MAX_ASSETS} assets. Remove one first.`,
    };
  }

  const id = crypto.randomBytes(12).toString('hex');
  const key = assetKey(pkg, id, kind.ext);

  // Bytes first, index second. The reverse order can leave the index pointing
  // at an object that was never written, which renders as a broken tile with
  // no way to clear it.
  await getBucket()
    .file(key)
    .save(buffer, { contentType: kind.contentType, resumable: false });

  // The thumbnail, if one came and if it really is an image. It must never be
  // larger than what it is standing in for — a "thumbnail" heavier than the
  // original is a sign the client got the encode wrong, and storing it would
  // make the strip slower rather than faster.
  let thumbKey = null;
  let thumbBytes = null;
  let thumbContentType = null;
  if (Buffer.isBuffer(thumb) && thumb.length) {
    const thumbKind = sniff(thumb);
    if (
      thumbKind &&
      thumbKind.kind === 'image' &&
      thumb.length <= MAX_IMAGE_BYTES &&
      thumb.length < buffer.length
    ) {
      thumbKey = assetKey(pkg, `${id}-thumb`, thumbKind.ext);
      thumbContentType = thumbKind.contentType;
      thumbBytes = thumb.length;
      await getBucket()
        .file(thumbKey)
        .save(thumb, { contentType: thumbKind.contentType, resumable: false });
    }
  }

  const asset = {
    id,
    key,
    kind: kind.kind,
    contentType: kind.contentType,
    bytes: buffer.length,
    alt: String(alt).slice(0, 200),
    order: existing.length,
    uploadedAt: new Date().toISOString(),
    thumbKey,
    thumbBytes,
    thumbContentType,
    // Intrinsic pixel size, so a tile can reserve its space before the bytes
    // land instead of collapsing to nothing and shoving the page down when
    // they arrive. Recorded only when the client measured it.
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
  };
  await saveIndex(pkg, [...existing, asset]);
  return { ok: true, asset };
}

/**
 * Raw bytes for one asset, or null. Reads are always proxied — see routes.
 *
 * `variant: 'thumb'` serves the downscaled copy when there is one. Assets
 * stored before thumbnails existed have no `thumbKey`, and a request for their
 * thumbnail falls back to the original rather than 404ing — the strip asks for
 * a thumbnail for every tile and must not break on the older half of them.
 *
 * The returned `contentType` belongs to whichever object was actually read,
 * not to the asset record: a WebP thumbnail of a PNG served as `image/png` is
 * a file the browser refuses to decode.
 */
async function readAsset(pkg, id, { variant = 'full' } = {}) {
  const assets = await listAssets(pkg);
  const asset = assets.find(a => a.id === id);
  if (!asset) return null;

  const useThumb = variant === 'thumb' && !!asset.thumbKey;
  const key = useThumb ? asset.thumbKey : asset.key;
  const contentType = useThumb
    ? asset.thumbContentType || 'image/webp'
    : asset.contentType;

  try {
    const [contents] = await getBucket().file(key).download();
    return {
      asset,
      buffer: contents,
      contentType,
      variant: useThumb ? 'thumb' : 'full',
    };
  } catch (err) {
    if (isNotFound(err)) {
      // A thumbnail recorded in the index but missing from the bucket must not
      // take the image down with it.
      if (useThumb) return readAsset(pkg, id, { variant: 'full' });
      return null;
    }
    throw err;
  }
}

/** Remove the object, then the index entry. */
async function removeAsset(pkg, id) {
  const assets = await listAssets(pkg);
  const asset = assets.find(a => a.id === id);
  if (!asset) return false;

  // Object first: dropping the index entry first would orphan the bytes, which
  // is exactly the leak package-delete already has.
  //
  // ⚠️ BOTH OBJECTS. The thumbnail is a second file, and forgetting it here
  // would leave a readable copy of a picture behind after its owner asked for
  // it to be removed — the same leak, reintroduced at a different key.
  if (bucketName()) {
    await getBucket().file(asset.key).delete({ ignoreNotFound: true });
    if (asset.thumbKey) {
      await getBucket().file(asset.thumbKey).delete({ ignoreNotFound: true });
    }
  }
  const remaining = assets
    .filter(a => a.id !== id)
    .map((a, i) => ({ ...a, order: i }));
  await saveIndex(pkg, remaining);
  return true;
}

/** Reorder and/or re-caption. Ids not present are ignored. */
async function updateAssets(pkg, updates) {
  const assets = await listAssets(pkg);
  const byId = new Map(assets.map(a => [a.id, a]));
  const next = [];
  for (const u of updates) {
    const found = byId.get(u.id);
    if (!found) continue;
    next.push({
      ...found,
      alt: typeof u.alt === 'string' ? u.alt.slice(0, 200) : found.alt,
    });
    byId.delete(u.id);
  }
  // Anything the caller did not mention keeps its relative order at the end,
  // rather than being silently deleted by an incomplete request.
  for (const leftover of byId.values()) next.push(leftover);

  const reordered = next.map((a, i) => ({ ...a, order: i }));
  await saveIndex(pkg, reordered);
  return reordered;
}

/**
 * Every asset for a package, bytes and index.
 *
 * ⚠️ FOR PACKAGE DELETE. Deleting a package while its images stay in the
 * bucket repeats the known `.mpk` orphan-blob leak — except these are files a
 * person uploaded, and the reason for the delete may have been that they
 * asked for them to be taken down. Objects first, index last, so a failure
 * halfway leaves entries pointing at bytes rather than bytes with nothing
 * pointing at them.
 */
async function removeAllAssets(pkg) {
  const assets = await listAssets(pkg);
  if (bucketName()) {
    for (const a of assets) {
      await getBucket().file(a.key).delete({ ignoreNotFound: true });
      // The thumbnail too — see removeAsset.
      if (a.thumbKey) {
        await getBucket().file(a.thumbKey).delete({ ignoreNotFound: true });
      }
    }
  }
  await kv.del(indexKey(pkg));
  return assets.length;
}

function _resetForTests() {
  _storage = undefined;
  _bucket = undefined;
  _bucketName = undefined;
}

module.exports = {
  listAssets,
  addAsset,
  readAsset,
  removeAsset,
  removeAllAssets,
  updateAssets,
  sniff,
  indexKey,
  assetKey,
  MAX_ASSETS,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  _resetForTests,
};
