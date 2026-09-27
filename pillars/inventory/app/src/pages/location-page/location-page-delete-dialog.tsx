import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import type { ReactElement } from 'react';

import type { DeletePlaceState } from './location-page-parts.js';

function DeleteSummary({ state }: { state: DeletePlaceState }): ReactElement {
  if (state.childCount > 0) {
    return (
      <p>
        {state.childCount} {state.childCount === 1 ? 'place is' : 'places are'} inside and will be
        deleted.
      </p>
    );
  }
  if (state.itemCount > 0) {
    return (
      <p>
        {state.itemCount} {state.itemCount === 1 ? 'thing returns' : 'things return'} to In hand.
      </p>
    );
  }
  return <p>This place is empty.</p>;
}

/** Renders the confirmation step for deleting a place and its descendants. */
export function DeletePlaceDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: DeletePlaceState | null;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{state?.name}”?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        {state !== null ? (
          <div className="space-y-2 text-sm">
            <DeleteSummary state={state} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {state?.requiresForce ? 'Delete everything' : 'Delete place'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
