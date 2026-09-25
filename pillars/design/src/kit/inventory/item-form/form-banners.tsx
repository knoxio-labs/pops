/**
 * The one line above the form when something outside it matters: no
 * connection, the item changed elsewhere, the last save failed, or the item
 * just created by Save and new.
 */
import { CircleCheck } from 'lucide-react';

import { Button } from '@pops/ui';

import { StateBanner } from '../shared/state-banner';

import type { ItemFormOpening, JustCreated } from './form-opening';

function Created({ created }: { created: JustCreated }) {
  const photos =
    created.photos === 0
      ? ''
      : ` with ${created.photos === 1 ? 'a photo' : `${created.photos} photos`}`;
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <CircleCheck className="size-4 shrink-0 text-app-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Created {created.name}</span> in {created.place}
        {photos}. Type and place are kept for the next one.
      </p>
      <Button size="sm" variant="outline" className="shrink-0">
        Open it
      </Button>
    </div>
  );
}

/** Whichever banner the opening calls for, or nothing. */
export function FormBanner({ opening, name }: { opening: ItemFormOpening; name: string }) {
  if (opening.banner === 'offline') {
    return (
      <StateBanner
        kind="offline"
        title="No connection. Nothing can be saved until it returns."
        detail="What you type stays in this page."
      />
    );
  }
  if (opening.banner === 'stale') {
    return (
      <StateBanner
        kind="stale"
        title={`${name} changed on an iPhone 2 min ago: Unit price is now 92.00.`}
        detail="Saving writes only the fields you change here, so theirs stays unless you change it."
        actionLabel="Reload"
      />
    );
  }
  if (opening.phase === 'save-failed') {
    return (
      <StateBanner
        kind="error"
        title="Not saved. The inventory service did not answer."
        detail="Everything you typed is still here."
        actionLabel="Try again"
      />
    );
  }
  return opening.justCreated === undefined ? null : <Created created={opening.justCreated} />;
}
