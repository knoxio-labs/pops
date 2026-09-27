import { MapPin } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
} from '@pops/ui';

import { StateBanner } from '../../foundation/feedback/state-banner.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';

const LOCATION_SKELETON_ROWS = ['title', 'tabs', 'toolbar', 'content', 'dock'];

/** Renders the location page's loading geometry. */
export function LocationSkeleton(): ReactElement {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-busy="true"
      aria-label="Loading location"
    >
      {LOCATION_SKELETON_ROWS.map((row) => (
        <Skeleton key={row} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Renders a retryable page-level inventory error. */
export function LoadError({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={MapPin}
        title={title}
        description={detail}
        action={
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

/** Renders the inline title editor for a location. */
export function RenameInput({
  place,
  onCommit,
  onCancel,
}: {
  place: LocationModel;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): ReactElement {
  const [value, setValue] = useState(place.name);
  return (
    <Input
      autoFocus
      aria-label={`Rename ${place.name}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(value);
        }
        if (event.key === 'Escape') onCancel();
      }}
      className="h-9 max-w-sm text-lg font-semibold"
    />
  );
}

/** Renders the first step of the Store here flow. */
export function StoreHereDialog({
  open,
  place,
  onClose,
  onCreate,
}: {
  open: boolean;
  place: LocationModel;
  onClose: () => void;
  onCreate: () => void;
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Store here</DialogTitle>
          <DialogDescription>Choose how to add something to {place.name}.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onCreate}>New item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Renders the undo affordance after moving a place. */
export function MoveNotice({
  name,
  parentName,
  onUndo,
  onDismiss,
}: {
  name: string;
  parentName: string;
  onUndo: () => void;
  onDismiss: () => void;
}): ReactElement {
  return (
    <StateBanner
      kind="needs-attention"
      title={`${name} moved to ${parentName}.`}
      actionLabel="Undo"
      onAction={() => {
        onUndo();
        onDismiss();
      }}
      className="mb-2"
    />
  );
}

/** Formats the server change group for the stale banner. */
export function staleTitle(subject: string, group: WebChangeGroup): string {
  const age = Math.max(0, Date.now() - Date.parse(group.latestServerTime));
  const minutes = Math.floor(age / 60_000);
  const ageCopy =
    minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : 'over an hour ago';
  return `${subject} changed on ${group.actorLabel} ${ageCopy}.`;
}

/** Renders the deliberate 404 state for an unknown location URL. */
export function NoSuchPlace({ onBack }: { onBack: () => void }): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={MapPin}
        title="No such place"
        description="No place in Inventory has this link."
        action={
          <Button variant="outline" onClick={onBack}>
            Back to Locations
          </Button>
        }
      />
    </div>
  );
}
