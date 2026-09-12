import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ImageOff,
  Trash2,
  Pencil,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Maximize2,
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
  const [busy, setBusy] = useState(false);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const key = ['assets', pkg];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getPackageAssets(pkg),
  });

  const assets = data?.assets ?? [];
  const pending = !!data?.pendingApproval;

  const upload = useMutation({
    mutationFn: (file: File) => uploadPackageAsset(pkg, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      notify('Uploaded.', 'success');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      notify(e?.response?.data?.message ?? 'Upload failed.', 'error');
    },
    onSettled: () => setBusy(false),
  });

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
    const file = e.target.files?.[0];
    // Reset the input, or picking the same file twice in a row fires nothing.
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    upload.mutate(file);
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
            title='Add an image or video'
            className='inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-neutral-400 transition-colors hover:bg-ink/[0.04] hover:text-neutral-200'
          >
            <Pencil className='h-3.5 w-3.5' aria-hidden='true' />
            {busy ? 'Uploading…' : 'Edit'}
            <input
              type='file'
              accept='image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm'
              className='sr-only'
              onChange={onPick}
              disabled={busy}
              aria-label='Add an image or video to the preview'
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
          className='mb-3 inline-flex items-center gap-1.5 rounded-md border border-amber-800/40 bg-amber-950/30 px-2.5 py-1.5 text-[12px] text-amber-300'
        >
          <EyeOff className='h-3.5 w-3.5' aria-hidden='true' />
          Visible only to you until an admin approves this package.
        </p>
      )}

      {assets.length === 0 ? (
        <div
          data-testid='no-preview'
          className='flex h-44 items-center justify-center rounded-xl border border-dashed border-line-strong bg-ink/[0.02]'
        >
          <span className='inline-flex items-center gap-2 text-[12.5px] text-neutral-500'>
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
          className='input mt-1.5 h-7 w-full max-w-[18rem] text-[11.5px]'
        />
      ) : (
        asset.alt && (
          <p className='mt-1.5 max-w-[18rem] truncate text-[11.5px] text-neutral-500'>
            {asset.alt}
          </p>
        )
      )}
    </div>
  );
}
