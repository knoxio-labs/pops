import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@pops/ui';

import type { CatalogueDescriptor } from './types';

interface PublishDialogProps {
  readonly catalogue: CatalogueDescriptor;
  readonly isPending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublish: (input: { note: string | null; minimumProtocol?: number }) => void;
  readonly open: boolean;
}

/** Collects publication metadata before committing an immutable revision. */
export function PublishDialog({
  catalogue,
  isPending,
  onOpenChange,
  onPublish,
  open,
}: PublishDialogProps) {
  const [note, setNote] = useState('');
  const [minimumProtocol, setMinimumProtocol] = useState(catalogue.revision.minimumProtocol);
  const validProtocol = Number.isInteger(minimumProtocol) && minimumProtocol >= 1;
  function publish(): void {
    onPublish({ note: note.trim() === '' ? null : note.trim(), minimumProtocol });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish revision {catalogue.revision.revision}?</DialogTitle>
          <DialogDescription>
            Publication is atomic and creates an immutable catalogue revision for every client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="catalogue-publication-note">Publication note</Label>
            <Textarea
              id="catalogue-publication-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="catalogue-minimum-protocol">Minimum client protocol</Label>
            <Input
              id="catalogue-minimum-protocol"
              type="number"
              min={1}
              value={minimumProtocol}
              onChange={(event) => setMinimumProtocol(event.target.valueAsNumber)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isPending || !validProtocol} onClick={publish}>
            Publish revision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
