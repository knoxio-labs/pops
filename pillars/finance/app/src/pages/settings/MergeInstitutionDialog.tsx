import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntitySelect,
} from '@pops/ui';

import { type Institution } from './types';

interface MergeInstitutionDialogProps {
  merging: Institution | null;
  institutions: Institution[];
  onOpenChange: (v: boolean) => void;
  isSubmitting: boolean;
  onConfirm: (targetId: string) => void;
}

/**
 * Picks the survivor for `merging` and confirms the merge. The source itself
 * is excluded from the picker — merging an institution into itself is
 * refused server-side (422) and offering it here would just be a guaranteed
 * error tap.
 */
export function MergeInstitutionDialog({
  merging,
  institutions,
  onOpenChange,
  isSubmitting,
  onConfirm,
}: MergeInstitutionDialogProps) {
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const targets = institutions.filter((i) => i.id !== merging?.id);

  const handleOpenChange = (v: boolean) => {
    if (isSubmitting) return;
    if (!v) setTargetId(undefined);
    onOpenChange(v);
  };

  return (
    <Dialog open={!!merging} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <DialogHeader>
          <DialogTitle>Merge {merging?.name} into…</DialogTitle>
          <DialogDescription>
            Every account on {merging?.name} moves to the institution you pick, and {merging?.name}{' '}
            is then deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <EntitySelect
            entities={targets}
            value={targetId}
            onChange={(id) => setTargetId(id)}
            placeholder="Choose an institution…"
            searchPlaceholder="Search institutions..."
            emptyMessage="No other institutions found."
            aria-label="Merge target institution"
            disabled={isSubmitting}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !targetId}
            onClick={() => targetId && onConfirm(targetId)}
          >
            {isSubmitting ? 'Merging…' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
