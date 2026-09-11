import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ImageOff,
  Trash2,
  Pencil,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getPackageAssets,
  uploadPackageAsset,
  deletePackageAsset,
  reorderPackageAssets,
  type PackageAsset,
} from '@/lib/api';
import { useToast } from './Toast';

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

  const { data } = useQuery({
    queryKey: ['assets', pkg],
    queryFn: () => getPackageAssets(pkg),
  });

  const assets = data?.assets ?? [];
  const pending = !!data?.pendingApproval;

  const upload = useMutation({
    mutationFn: (file: File) => uploadPackageAsset(pkg, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', pkg] });
      notify('Uploaded.', 'success');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      notify(e?.response?.data?.message ?? 'Upload failed.', 'error');
    },
    onSettled: () => setBusy(false),
  });

  /**
   * Order and captions, both through the one PATCH the API already had.
   *
   * ⚠️ THE ENDPOINT TAKES THE WHOLE LIST, and anything omitted keeps its
   * relative position at the end rather than being deleted — so a partial
   * request silently reorders. Every call here sends every asset.
   */
  const arrange = useMutation({
    mutationFn: (next: PackageAsset[]) =>
      reorderPackageAssets(
        pkg,
        next.map(a => ({ id: a.id, alt: a.alt }))
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', pkg] }),
    onError: () => notify('Could not save that change.', 'error'),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', pkg] });
      notify('Removed.', 'success');
    },
    onError: () => notify('Could not remove that file.', 'error'),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input, or picking the same file twice in a row fires nothing.
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    upload.mutate(file);
  };

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
              onRemove={() => remove.mutate(a.id)}
              onMove={delta => move(a.id, delta)}
              onCaption={alt => caption(a.id, alt)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AssetTile({
  asset,
  canEdit,
  first,
  last,
  onRemove,
  onMove,
  onCaption,
}: {
  asset: PackageAsset;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onCaption: (alt: string) => void;
}) {
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
          <img
            src={asset.url}
            alt={asset.alt}
            loading='lazy'
            decoding='async'
            className='h-44 rounded-xl border border-line object-cover'
          />
        )}
        {canEdit && (
          <>
            <button
              onClick={onRemove}
              aria-label='Remove this file'
              className='absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100'
            >
              <Trash2 className='h-3.5 w-3.5' />
            </button>

            {/* Order. Buttons rather than drag-and-drop: the first screenshot
              is the one the home page and the card use, so "make this one
              first" is the whole job, and a drag target is unreachable from a
              keyboard and awkward on a phone. */}
            <div className='absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
              <button
                onClick={() => onMove(-1)}
                disabled={first}
                aria-label='Move earlier'
                className='rounded-md bg-black/70 p-1.5 text-neutral-300 transition-colors hover:text-white disabled:opacity-30'
              >
                <ChevronLeft className='h-3.5 w-3.5' />
              </button>
              <button
                onClick={() => onMove(1)}
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
