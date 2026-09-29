import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ImageOff,
  Trash2,
  Pencil,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
  RotateCw,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  getPackageAssets,
  uploadPackageAsset,
  deletePackageAsset,
  reorderPackageAssets,
  type PackageAsset,
  type PackageAssets,
} from '@/lib/api';
import { useToast } from './Toast';
import { Lightbox, type LightboxItem } from './Lightbox';
import {
  preloadImage,
  preloadWhenIdle,
  mayPreloadInBackground,
} from '@/lib/imageCache';

/**
 * How many originals to fetch in the background once the strip is up.
 *
 * Not all of them: the whole reason the strip loads thumbnails is that eight
 * originals can be 32MB, and pulling them all on every page view would put
 * that cost straight back. The first few are the ones people open; any other
 * tile is fetched the moment the pointer or focus reaches it, which is well
 * ahead of the click.
 */
const BACKGROUND_PRELOADS = 3;

/**
 * Mirrors `MAX_ASSETS` in packages/backend/src/lib/asset-store.js. The server
 * is the authority and refuses the ninth upload with a 409 regardless; this
 * copy only exists so a pick of twelve files queues the ones that fit instead
 * of sending four requests that are certain to be refused.
 */
const MAX_ASSETS = 8;

/** One picked file on its way to the registry. */
interface QueuedUpload {
  key: string;
  file: File;
  /** An object URL for the queue tile, or null for a video. */
  preview: string | null;
  status: 'queued' | 'uploading' | 'failed';
  error?: string;
}

let uploadSeq = 0;

/**
 * The preview strip on an app page, plus the editor for whoever owns it.
 *
 * A package with no images shows ONE placeholder tile rather than an empty
 * region — an app page that simply has no preview section looks unfinished,
 * while "No preview available" is a statement.
 *
 * Everything here is gated server-side. The listing returns an empty array to
 * anyone who may not see a pending package's assets, so this component never
 * decides visibility itself; it only reports what came back.
 *
 * TILES LOAD THUMBNAILS; ONLY THE LIGHTBOX LOADS THE ORIGINAL. See
 * lib/image.ts for where the small copy comes from and why it is made in the
 * browser.
 */
export function AppPreview({
  pkg,
  canEdit,
}: {
  pkg: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueuedUpload[]>([]);

  const key = ['assets', pkg];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getPackageAssets(pkg),
  });

  const assets = data?.assets ?? [];
  const pending = !!data?.pendingApproval;

  // Warm the first few originals once the browser has nothing better to do,
  // so opening one full screen paints immediately. Keyed on the URLs rather
  // than the array, which react-query rebuilds on every refetch.
  const warmKey = assets
    .filter(a => a.kind === 'image')
    .slice(0, BACKGROUND_PRELOADS)
    .map(a => a.url)
    .join('\n');
  useEffect(() => {
    if (!warmKey || !mayPreloadInBackground()) return;
    return preloadWhenIdle(warmKey.split('\n'));
  }, [warmKey]);

  /**
   * Picked files upload ONE AT A TIME, in the order they were picked.
   *
   * ⚠️ NOT IN PARALLEL. Every upload rewrites the package's whole asset index
   * (a read-modify-write of one key), so concurrent POSTs race and the loser's
   * row is silently dropped — the object lands in storage and never appears in
   * the strip. One request at a time also keeps each base64 body alone on the
   * wire, which is what the serverless body limit was sized for.
   *
   * `inFlight` is a ref, not derived from state, because StrictMode runs this
   * effect twice with the SAME queue snapshot; guarding on state alone would
   * start the first file twice.
   */
  const inFlight = useRef<string | null>(null);
  const uploadedInRun = useRef(0);

  useEffect(() => {
    if (inFlight.current) return;
    const next = queue.find(q => q.status === 'queued');
    if (!next) {
      // The run is over. One toast for the batch rather than one per file.
      if (uploadedInRun.current > 0) {
        const n = uploadedInRun.current;
        uploadedInRun.current = 0;
        notify(n === 1 ? 'Uploaded.' : `Uploaded ${n} files.`, 'success');
      }
      return;
    }
    inFlight.current = next.key;
    setQueue(q =>
      q.map(i => (i.key === next.key ? { ...i, status: 'uploading' } : i))
    );
    uploadPackageAsset(pkg, next.file)
      // Wait for the refetch so the new tile is in the strip BEFORE its queue
      // tile disappears — otherwise the picture blinks out and back in.
      .then(() => qc.invalidateQueries({ queryKey: key }))
      .then(() => {
        uploadedInRun.current += 1;
        if (next.preview) URL.revokeObjectURL(next.preview);
        setQueue(q => q.filter(i => i.key !== next.key));
      })
      .catch((err: unknown) => {
        const e = err as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        const error =
          e?.response?.data?.message ?? e?.message ?? 'Upload failed.';
        notify(`${next.file.name}: ${error}`, 'error');
        setQueue(q =>
          q.map(i =>
            i.key === next.key ? { ...i, status: 'failed', error } : i
          )
        );
      })
      .finally(() => {
        inFlight.current = null;
      });
  }, [queue, pkg]);

  // Object URLs outlive the component unless released.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(
    () => () =>
      queueRef.current.forEach(
        i => i.preview && URL.revokeObjectURL(i.preview)
      ),
    []
  );

  const dropFromQueue = (k: string) =>
    setQueue(q => {
      const item = q.find(i => i.key === k);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return q.filter(i => i.key !== k);
    });

  const retry = (k: string) =>
    setQueue(q =>
      q.map(i =>
        i.key === k ? { ...i, status: 'queued', error: undefined } : i
      )
    );

  const outstanding = queue.filter(q => q.status !== 'failed').length;
  const busy = outstanding > 0;

  /**
   * Write the strip's new order into the cache immediately.
   *
   * ⚠️ THIS IS WHY THE ARROWS LOOKED BROKEN. They were correct, and the PATCH
   * they sent was correct, but nothing on screen moved until the request came
   * back AND a refetch of the listing completed after it. Against the asset
   * endpoints as they were — a full auth and ownership resolution per call —
   * that was a second or more of a button that visibly did nothing, so it read
   * as a dead control and got clicked again, queueing another swap.
   *
   * The reorder is local state the server merely persists, so the cache is
   * updated first and rolled back only if the write is refused.
   */
  const applyLocally = (next: PackageAsset[]) => {
    const previous = qc.getQueryData<PackageAssets>(key);
    qc.setQueryData<PackageAssets>(key, old =>
      old ? { ...old, assets: next.map((a, i) => ({ ...a, order: i })) } : old
    );
    return previous;
  };

  const arrange = useMutation({
    // The endpoint takes the WHOLE list, and anything omitted keeps its
    // relative position at the end rather than being deleted — so a partial
    // request silently reorders. Every call here sends every asset.
    mutationFn: (next: PackageAsset[]) =>
      reorderPackageAssets(
        pkg,
        next.map(a => ({ id: a.id, alt: a.alt }))
      ),
    onMutate: (next: PackageAsset[]) => {
      // Stop an in-flight refetch from landing on top of the optimistic write
      // and snapping the tiles back to the server's previous order.
      qc.cancelQueries({ queryKey: key });
      return { previous: applyLocally(next) };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      notify('Could not save that change.', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const move = (id: string, delta: number) => {
    const from = assets.findIndex(a => a.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= assets.length) return;
    const next = [...assets];
    [next[from], next[to]] = [next[to], next[from]];
    arrange.mutate(next);
  };

  const caption = (id: string, alt: string) =>
    arrange.mutate(assets.map(a => (a.id === id ? { ...a, alt } : a)));

  const remove = useMutation({
    mutationFn: (id: string) => deletePackageAsset(pkg, id),
    // Same reasoning as the reorder: the tile goes now, not after a round-trip.
    onMutate: (id: string) => {
      qc.cancelQueries({ queryKey: key });
      return { previous: applyLocally(assets.filter(a => a.id !== id)) };
    },
    onSuccess: () => notify('Removed.', 'success'),
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      notify('Could not remove that file.', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset the input, or picking the same file twice in a row fires nothing.
    e.target.value = '';
    if (files.length === 0) return;

    // Slots left once everything already queued has landed. Failed items do
    // not hold a slot — they are not going anywhere until retried.
    const free = Math.max(0, MAX_ASSETS - assets.length - outstanding);
    const accepted = files.slice(0, free);
    const skipped = files.length - accepted.length;
    if (skipped > 0) {
      notify(
        accepted.length === 0
          ? `A package may have at most ${MAX_ASSETS} images or videos. Remove one first.`
          : `Only ${accepted.length} more fit (at most ${MAX_ASSETS}); skipped ${skipped}.`,
        'error'
      );
    }
    if (accepted.length === 0) return;

    setQueue(q => [
      ...q,
      ...accepted.map(file => ({
        key: `upload-${++uploadSeq}`,
        file,
        preview: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : null,
        status: 'queued' as const,
      })),
    ]);
  };

  // The full-size sources, in the order shown. Built from the same array the
  // strip renders, so opening tile 3 opens item 3 even mid-reorder.
  const lightboxItems: LightboxItem[] = assets.map(a => ({
    id: a.id,
    url: a.url,
    alt: a.alt,
    kind: a.kind,
    width: a.width,
    height: a.height,
    // Already in the browser from the strip, so the lightbox can show it on
    // its first frame while the original is still arriving.
    thumbUrl: a.thumbUrl ?? undefined,
  }));

  return (
    <section data-testid='app-preview' aria-label='Preview'>
      <div className='mb-3 flex items-center justify-between'>
        <p className='section-heading'>Preview</p>
        {/* An edit affordance, in the same shape and place as the "Edit
            metadata" pencil in the header — editing a package's pictures and
            editing its name are the same job, done by the same people, and
            they were two different-looking controls.

            ⚠️ It is a <label> wrapping a hidden file input, NOT a button. A
            file picker can only be opened by a real user gesture on an
            `<input type=file>`; routing the click through a button and
            calling `.click()` on the input works today and is the first thing
            a stricter browser policy breaks. */}
        {canEdit && (
          <label
            data-testid='asset-edit'
            title='Add images or videos'
            className='inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[14px] text-neutral-400 transition-colors hover:bg-ink/[0.04] hover:text-neutral-200'
          >
            <Pencil className='h-3.5 w-3.5' aria-hidden='true' />
            {busy ? `Uploading… ${outstanding} left` : 'Edit'}
            {/* `multiple`: pick several at once; they queue and upload one
                by one (see the effect above). Still enabled mid-upload, so a
                second pick joins the end of the line. */}
            <input
              type='file'
              multiple
              accept='image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm'
              className='sr-only'
              onChange={onPick}
              aria-label='Add images or videos to the preview'
              data-testid='asset-input'
            />
          </label>
        )}
      </div>

      {/* Only the owner and admins can see a pending package's assets, so this
          notice only ever renders for them — and it has to, or a publisher
          assumes the upload silently failed. */}
      {pending && assets.length > 0 && (
        <p
          data-testid='assets-pending'
          className='mb-3 inline-flex items-center gap-1.5 rounded-md border border-amber-800/40 bg-amber-950/30 px-2.5 py-1.5 text-[14px] text-amber-300'
        >
          <EyeOff className='h-3.5 w-3.5' aria-hidden='true' />
          Visible only to you until an admin approves this package.
        </p>
      )}

      {queue.length > 0 && (
        <UploadQueue queue={queue} onRemove={dropFromQueue} onRetry={retry} />
      )}

      {assets.length === 0 && queue.length > 0 ? null : assets.length === 0 ? (
        <div
          data-testid='no-preview'
          className='flex h-44 items-center justify-center rounded-xl border border-dashed border-line-strong bg-ink/[0.02]'
        >
          <span className='inline-flex items-center gap-2 text-[14.5px] text-neutral-500'>
            <ImageOff className='h-4 w-4' aria-hidden='true' />
            No preview available
          </span>
        </div>
      ) : (
        <div className='flex gap-3 overflow-x-auto pb-2'>
          {assets.map((a, i) => (
            <AssetTile
              key={a.id}
              asset={a}
              canEdit={canEdit}
              first={i === 0}
              last={i === assets.length - 1}
              onOpen={() => setOpenAt(i)}
              onRemove={() => remove.mutate(a.id)}
              onMove={delta => move(a.id, delta)}
              onCaption={alt => caption(a.id, alt)}
            />
          ))}
        </div>
      )}

      {openAt !== null && (
        <Lightbox
          items={lightboxItems}
          index={Math.min(openAt, Math.max(0, lightboxItems.length - 1))}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </section>
  );
}

/**
 * The line of picked files, in upload order: one uploading, the rest waiting,
 * and any that failed kept in place with the server's reason so the publisher
 * can retry or drop them instead of wondering which of eight went missing.
 */
function UploadQueue({
  queue,
  onRemove,
  onRetry,
}: {
  queue: QueuedUpload[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  return (
    <ol
      data-testid='upload-queue'
      aria-label='Upload queue'
      className='mb-3 flex gap-2 overflow-x-auto pb-1'
    >
      {queue.map((item, i) => (
        <li
          key={item.key}
          data-testid='upload-queue-item'
          data-status={item.status}
          title={item.error ?? item.file.name}
          className={`relative flex h-20 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-ink/[0.03] ${
            item.status === 'failed' ? 'border-red-700/60' : 'border-line'
          }`}
        >
          {item.preview ? (
            <img
              src={item.preview}
              alt=''
              className={`h-full w-full object-cover ${
                item.status === 'uploading' ? '' : 'opacity-50'
              }`}
            />
          ) : (
            <span className='truncate px-2 text-[12.5px] text-neutral-400'>
              {item.file.name}
            </span>
          )}

          <span className='absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[12px] text-neutral-200'>
            {item.status === 'uploading' ? (
              <span className='inline-flex items-center gap-1'>
                <Loader2 className='h-3 w-3 animate-spin' aria-hidden='true' />
                Uploading
              </span>
            ) : item.status === 'failed' ? (
              <span className='inline-flex items-center gap-1 text-red-300'>
                <AlertCircle className='h-3 w-3' aria-hidden='true' />
                Failed
              </span>
            ) : (
              `#${i + 1} waiting`
            )}
          </span>

          {item.status === 'failed' && (
            <button
              type='button'
              onClick={() => onRetry(item.key)}
              aria-label={`Retry ${item.file.name}`}
              className='absolute right-7 top-1 rounded bg-black/70 p-1 text-neutral-300 hover:text-white'
            >
              <RotateCw className='h-3 w-3' />
            </button>
          )}
          {/* The file mid-upload cannot be pulled back — the request is
              already on the wire — so only waiting and failed ones get an X. */}
          {item.status !== 'uploading' && (
            <button
              type='button'
              onClick={() => onRemove(item.key)}
              aria-label={`Remove ${item.file.name} from the queue`}
              className='absolute right-1 top-1 rounded bg-black/70 p-1 text-neutral-300 hover:text-white'
            >
              <X className='h-3 w-3' />
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function AssetTile({
  asset,
  canEdit,
  first,
  last,
  onOpen,
  onRemove,
  onMove,
  onCaption,
}: {
  asset: PackageAsset;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onCaption: (alt: string) => void;
}) {
  // The editing controls sit on top of the picture, which is itself the
  // button that opens it. Without this every Remove or Move click would also
  // open the lightbox behind the change it just made.
  const swallow = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div className='group relative flex-shrink-0'>
      <div className='relative h-44'>
        {asset.kind === 'video' ? (
          <video
            src={asset.url}
            controls
            preload='metadata'
            className='h-44 rounded-xl border border-line'
          />
        ) : (
          /* A real <button>, so the picture is reachable by keyboard and
             announced as something you can activate — a click handler on the
             <img> is neither. */
          <button
            type='button'
            onClick={onOpen}
            // Hover and focus both come well before a click: start the
            // original now so the lightbox usually has it by the time it opens.
            onMouseEnter={() => preloadImage(asset.url).catch(() => {})}
            onFocus={() => preloadImage(asset.url).catch(() => {})}
            aria-label={
              asset.alt ? `Open ${asset.alt} full screen` : 'Open full screen'
            }
            data-testid='asset-open'
            className='group/tile block h-44 cursor-zoom-in overflow-hidden rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
          >
            <img
              // ⚠️ THE THUMBNAIL, NOT `asset.url`. This tile is 176px tall and
              // was loading the publisher's original — up to 4MB, times eight
              // tiles, every one proxied through a function that buffers the
              // whole object first. `thumbUrl` falls back to the original for
              // assets uploaded before thumbnails existed, so this is safe for
              // every row in the index.
              // ?? `url`: `thumbUrl` is newly added to this response, so an
              // older payload (a stale SPA, a self-hosted backend on a
              // previous deploy) has no such field and must still render.
              src={asset.thumbUrl ?? asset.url}
              alt={asset.alt}
              // Reserves the box before the bytes land, so a strip of tiles
              // does not collapse and then shove the page down as each one
              // arrives.
              width={asset.width ?? undefined}
              height={asset.height ?? undefined}
              loading='lazy'
              decoding='async'
              className='h-44 w-auto max-w-none object-cover transition-transform duration-300 group-hover/tile:scale-[1.03]'
            />
          </button>
        )}

        {/* Only on the image tiles: a video's own controls occupy this corner,
            and an overlay there fights the play button. */}
        {asset.kind === 'image' && (
          <span
            aria-hidden='true'
            className='pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100'
          >
            <Maximize2 className='h-3.5 w-3.5' />
          </span>
        )}

        {canEdit && (
          <>
            <button
              onClick={swallow(onRemove)}
              aria-label='Remove this file'
              className='absolute left-2 top-2 rounded-md bg-black/70 p-1.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100'
            >
              <Trash2 className='h-3.5 w-3.5' />
            </button>

            {/* Order. Buttons rather than drag-and-drop: the first screenshot
              is the one the home page and the card use, so "make this one
              first" is the whole job, and a drag target is unreachable from a
              keyboard and awkward on a phone. */}
            <div className='absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
              <button
                onClick={swallow(() => onMove(-1))}
                disabled={first}
                aria-label='Move earlier'
                className='rounded-md bg-black/70 p-1.5 text-neutral-300 transition-colors hover:text-white disabled:opacity-30'
              >
                <ChevronLeft className='h-3.5 w-3.5' />
              </button>
              <button
                onClick={swallow(() => onMove(1))}
                disabled={last}
                aria-label='Move later'
                className='rounded-md bg-black/70 p-1.5 text-neutral-300 transition-colors hover:text-white disabled:opacity-30'
              >
                <ChevronRight className='h-3.5 w-3.5' />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Alt text. ⚠️ It is saved on BLUR, not per keystroke: the PATCH
          rewrites the whole index, so a request per character would be a
          request per character against a Redis write. */}
      {canEdit ? (
        <input
          defaultValue={asset.alt}
          onBlur={e => {
            if (e.target.value !== asset.alt) onCaption(e.target.value);
          }}
          placeholder='Describe this image'
          aria-label='Alt text'
          data-testid='asset-alt'
          className='input mt-1.5 h-7 w-full max-w-[18rem] text-[13px]'
        />
      ) : (
        asset.alt && (
          <p className='mt-1.5 max-w-[18rem] truncate text-[13px] text-neutral-500'>
            {asset.alt}
          </p>
        )
      )}
    </div>
  );
}
