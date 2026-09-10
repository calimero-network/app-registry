import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Trash2, Upload as UploadIcon, EyeOff } from 'lucide-react';
import {
  getPackageAssets,
  uploadPackageAsset,
  deletePackageAsset,
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
        {canEdit && (
          <label className='inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-neutral-400 transition-colors hover:text-neutral-200'>
            <UploadIcon className='h-3.5 w-3.5' aria-hidden='true' />
            {busy ? 'Uploading…' : 'Add image or video'}
            <input
              type='file'
              accept='image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm'
              className='sr-only'
              onChange={onPick}
              disabled={busy}
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
          className='flex h-44 items-center justify-center rounded-xl border border-dashed border-ink/[0.1] bg-ink/[0.02]'
        >
          <span className='inline-flex items-center gap-2 text-[12.5px] text-neutral-500'>
            <ImageOff className='h-4 w-4' aria-hidden='true' />
            No preview available
          </span>
        </div>
      ) : (
        <div className='flex gap-3 overflow-x-auto pb-2'>
          {assets.map(a => (
            <AssetTile
              key={a.id}
              asset={a}
              canEdit={canEdit}
              onRemove={() => remove.mutate(a.id)}
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
  onRemove,
}: {
  asset: PackageAsset;
  canEdit: boolean;
  onRemove: () => void;
}) {
  return (
    <div className='group relative h-44 flex-shrink-0'>
      {asset.kind === 'video' ? (
        <video
          src={asset.url}
          controls
          preload='metadata'
          className='h-44 rounded-xl border border-ink/[0.08]'
        />
      ) : (
        <img
          src={asset.url}
          alt={asset.alt}
          loading='lazy'
          decoding='async'
          className='h-44 rounded-xl border border-ink/[0.08] object-cover'
        />
      )}
      {canEdit && (
        <button
          onClick={onRemove}
          aria-label='Remove this file'
          className='absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100'
        >
          <Trash2 className='h-3.5 w-3.5' />
        </button>
      )}
    </div>
  );
}
