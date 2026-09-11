/**
 * Downscaling a picked image in the browser, before it is uploaded.
 *
 * WHY HERE AND NOT ON THE SERVER
 *
 * The preview strip draws every screenshot into a 176px-tall tile, and it was
 * loading the publisher's original to do it — up to the 4MB the store allows,
 * eight of them on one app page, each one proxied through a serverless
 * function that buffers the whole object before sending a byte. Resizing
 * server-side means an image library, and the only real option is `sharp`: a
 * platform-specific native binary added to every function in the deployment,
 * including the ones that never touch an image.
 *
 * The browser, at the moment someone picks a file, already has to decode that
 * bitmap to show it. Doing the downscale there costs nothing extra, needs no
 * dependency, and means the bytes that reach the registry are already the
 * right size for the tile.
 *
 * ⚠️ THE THUMBNAIL IS A CONVENIENCE, NEVER A REQUIREMENT. Every failure path
 * here returns `thumb: null` and lets the upload proceed with the original
 * alone, because the alternative — refusing an upload because a canvas encode
 * failed — breaks publishing to speed up a strip. The server treats a missing
 * thumbnail as "serve the full image", which is also what the assets uploaded
 * before this existed do.
 */

/** The longest edge a stored thumbnail is allowed to have. */
const MAX_EDGE = 720;

/**
 * Below this, a separate thumbnail is not worth storing: the tile would load
 * the original about as fast, and a second object is a second thing to keep,
 * serve and delete.
 */
const SKIP_UNDER_BYTES = 120 * 1024;

export interface PreparedImage {
  /** Base64 WebP (or JPEG) payload, with no `data:` prefix. Null if not made. */
  thumb: string | null;
  /** Intrinsic size of the ORIGINAL, for the tile's width/height attributes. */
  width: number | null;
  height: number | null;
}

const NOTHING: PreparedImage = { thumb: null, width: null, height: null };

/** Strip the `data:<type>;base64,` prefix a FileReader result carries. */
function payloadOf(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? null : dataUrl.slice(comma + 1) || null;
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(payloadOf(String(reader.result)));
    reader.readAsDataURL(blob);
  });
}

/**
 * Measure an image file and, when it is worth it, produce a downscaled copy.
 *
 * Videos and anything unreadable come back as {@link NOTHING}, which uploads
 * exactly as before.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) return NOTHING;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // A corrupt file, or a format this browser cannot decode. The server
    // sniffs the bytes itself and will reject it if it really is not an image.
    return NOTHING;
  }

  const { width, height } = bitmap;
  const size = { thumb: null as string | null, width, height };

  try {
    const longest = Math.max(width, height);
    // Already tile-sized, or small enough that a second object earns nothing.
    if (longest <= MAX_EDGE && file.size <= SKIP_UNDER_BYTES) return size;

    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return size;
    ctx.drawImage(bitmap, 0, 0, w, h);

    // WebP first; JPEG is the fallback for anything that cannot encode it.
    // ⚠️ `toBlob` hands back NULL rather than throwing when it does not know
    // the type, so an unchecked result is how you end up uploading "null".
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/webp', 0.82);
    });
    const usable =
      blob ??
      (await new Promise<Blob | null>(resolve => {
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82);
      }));
    if (!usable) return size;

    // A "thumbnail" heavier than the original is a failed encode — usually a
    // small PNG of flat colour, which WebP can lose to. Keep the original.
    if (usable.size >= file.size) return size;

    const base64 = await blobToBase64(usable);
    return { thumb: base64, width, height };
  } catch {
    return size;
  } finally {
    // Frees the decoded bitmap immediately instead of waiting for GC; eight
    // full-size screenshots held at once is real memory on a phone.
    bitmap.close?.();
  }
}
