import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ImageOff, Maximize2 } from 'lucide-react';
import { getReviewQueue, decidePackage, type ReviewItem } from '@/lib/api';
import { useToast } from './Toast';
import { Lightbox, type LightboxItem } from './Lightbox';

/**
 * The moderation queue: packages whose pictures nobody has looked at.
 *
 * The Packages tab lists every package flat with a Verify toggle, which
 * answers the wrong question. An admin moderating uploads needs to know which
 * packages have unreviewed images and needs to SEE the images — a decision
 * about pictures taken without looking at them is not a review.
 *
 * ⚠️ DECLINING NEEDS A REASON, AND THE OWNER READS IT. It is not an internal
 * note: it is the only thing that tells a publisher why their screenshots are
 * not public and what to change. The button stays disabled until there is one.
 *
 * ⚠️ THE IMAGES ARE SERVED THROUGH THE API, and this is the one screen where
 * they are fetched while still PENDING — which works only because the caller
 * is an admin and every read re-checks that. A bucket URL here would be a
 * public link to unreviewed content.
 */
export function ReviewQueue() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // Which package's gallery is open, and at which picture. Held here rather
  // than per card so only one lightbox can ever be mounted.
  const [viewing, setViewing] = useState<{ pkg: string; index: number } | null>(
    null
  );

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['review-queue'],
    queryFn: getReviewQueue,
  });

  const decide = useMutation({
    mutationFn: ({
      pkg,
      action,
      reason,
    }: {
      pkg: string;
      action: 'approve' | 'decline';
      reason?: string;
    }) => decidePackage(pkg, action, reason),
    onSuccess: (_d, vars) => {
      // Both the queue and every listing that carries a `verified` badge.
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.invalidateQueries({ queryKey: ['apps'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      notify(
        vars.action === 'approve' ? 'Approved — now public.' : 'Declined.',
        'success'
      );
    },
    onError: () => notify('Could not record that decision.', 'error'),
  });

  if (isLoading) {
    return <p className='text-[13px] text-neutral-500'>Loading queue…</p>;
  }

  if (!queue.length) {
    return (
      <div
        data-testid='review-empty'
        className='flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong py-12'
      >
        <ImageOff className='h-5 w-5 text-neutral-500' aria-hidden='true' />
        <p className='text-[13px] text-neutral-400'>
          Nothing waiting for review.
        </p>
        <p className='text-[12px] text-neutral-500'>
          Packages appear here when someone uploads an image or video.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4' data-testid='review-queue'>
      <p className='text-[12px] text-neutral-500'>
        {queue.length} package{queue.length === 1 ? '' : 's'} waiting. Longest
        wait first.
      </p>
      {queue.map(item => (
        <ReviewCard
          key={item.package}
          item={item}
          reason={reasons[item.package] ?? ''}
          setReason={v => setReasons(r => ({ ...r, [item.package]: v }))}
          busy={decide.isPending}
          onApprove={() =>
            decide.mutate({ pkg: item.package, action: 'approve' })
          }
          onDecline={() =>
            decide.mutate({
              pkg: item.package,
              action: 'decline',
              reason: reasons[item.package] ?? '',
            })
          }
          onOpen={index => setViewing({ pkg: item.package, index })}
        />
      ))}
      {viewing && (
        <QueueLightbox
          items={
            queue
              .find(q => q.package === viewing.pkg)
              ?.assets.map(a => ({
                id: a.id,
                url: a.url,
                alt: a.alt,
                kind: a.kind,
                width: a.width,
                height: a.height,
              })) ?? []
          }
          index={viewing.index}
          onIndex={index => setViewing(v => (v ? { ...v, index } : v))}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * Guards against the queue refetching while a gallery is open: a decision on
 * another card removes it from the list, and the package being VIEWED can
 * disappear from under the lightbox. An empty list closes rather than
 * rendering a dialog with nothing in it.
 */
function QueueLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  if (!items.length) return null;
  return (
    <Lightbox
      items={items}
      index={Math.min(index, items.length - 1)}
      onIndex={onIndex}
      onClose={onClose}
    />
  );
}

function ReviewCard({
  item,
  reason,
  setReason,
  busy,
  onApprove,
  onDecline,
  onOpen,
}: {
  item: ReviewItem;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onOpen: (index: number) => void;
}) {
  return (
    <div className='card p-4' data-testid='review-card'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate text-[14px] font-medium text-neutral-200'>
            {item.metadata.name || item.package}
          </p>
          <p className='truncate font-mono text-[12px] text-neutral-500'>
            {item.package}
            {item.latestVersion ? ` · v${item.latestVersion}` : ''}
            {item.author ? ` · ${item.author}` : ''}
          </p>
        </div>
        <span
          data-testid='review-state'
          className={`pill ${
            item.state === 'declined'
              ? 'bg-red-500/10 text-red-400'
              : item.state === 'approved'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          {item.state === 'approved' ? 'approved · new upload' : item.state}
        </span>
      </div>

      {item.metadata.description && (
        <p className='mb-3 text-[12.5px] font-light leading-relaxed text-neutral-400'>
          {String(item.metadata.description)}
        </p>
      )}

      {/* Big enough to judge. A row of thumbnails is how unreviewed content
          gets approved without being looked at — so these stay large, and
          clicking one opens the publisher's FULL-resolution file, which is
          more than the old fixed `object-cover` crop ever showed.

          ⚠️ The tiles themselves load the downscaled copy. A queue of ten
          packages with eight pictures each was tens of megabytes of originals
          to paint one screen of decisions, every one of them proxied through
          a function that buffers the whole object before sending it. */}
      <div className='mb-3 flex gap-3 overflow-x-auto pb-1'>
        {item.assets.map((a, i) => (
          <div key={a.id} className='group relative flex-shrink-0'>
            {a.kind === 'video' ? (
              <video
                src={a.url}
                controls
                preload='metadata'
                className='h-56 rounded-lg border border-line'
                data-testid='review-asset'
              />
            ) : (
              <button
                type='button'
                onClick={() => onOpen(i)}
                aria-label={`Open ${a.alt || item.package} full screen`}
                className='block cursor-zoom-in overflow-hidden rounded-lg border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
              >
                <img
                  src={a.thumbUrl ?? a.url}
                  alt={a.alt || `${item.package} preview`}
                  width={a.width ?? undefined}
                  height={a.height ?? undefined}
                  loading='lazy'
                  decoding='async'
                  className='h-56 w-auto max-w-none object-cover'
                  data-testid='review-asset'
                />
                <span
                  aria-hidden='true'
                  className='pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100'
                >
                  <Maximize2 className='h-3.5 w-3.5' />
                </span>
              </button>
            )}
            {a.alt && (
              <p className='mt-1 max-w-[20rem] truncate text-[11px] text-neutral-500'>
                {a.alt}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <button
          onClick={onApprove}
          disabled={busy}
          data-testid='review-approve'
          className='inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[12.5px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50'
        >
          <Check className='h-3.5 w-3.5' aria-hidden='true' />
          Approve
        </button>

        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder='Reason (required to decline)'
          aria-label='Reason for declining'
          data-testid='review-reason'
          className='input h-8 max-w-xs flex-1'
        />

        <button
          onClick={onDecline}
          // ⚠️ The reason is what the owner will read. Declining without one
          // leaves them with hidden images and no idea what to change.
          disabled={busy || !reason.trim()}
          data-testid='review-decline'
          className='inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-[12.5px] font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-40'
        >
          <X className='h-3.5 w-3.5' aria-hidden='true' />
          Decline
        </button>
      </div>

      {item.state === 'declined' && item.reason && (
        <p className='mt-2 text-[12px] text-neutral-500'>
          Previously declined: {item.reason}
        </p>
      )}
    </div>
  );
}
