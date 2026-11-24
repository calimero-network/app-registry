import { Lock } from 'lucide-react';

/** A private package's tag, with its pending request to go public. A public package has none. */
export function VisibilityTag({
  visibility,
  pendingPublic,
}: {
  visibility?: 'private' | 'public';
  pendingPublic?: boolean;
}) {
  if (visibility !== 'private') return null;
  return (
    <>
      <span className='pill gap-1 bg-amber-500/10 text-amber-500'>
        <Lock className='h-3 w-3' aria-hidden='true' />
        Private
      </span>
      {pendingPublic && (
        <span className='pill bg-ink/[0.06] text-neutral-400'>
          Public: pending review
        </span>
      )}
    </>
  );
}
