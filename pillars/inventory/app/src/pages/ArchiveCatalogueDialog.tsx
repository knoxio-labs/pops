import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

import type { CatalogueOperation } from '../catalogue-editor/types';
import type { ArchiveTarget } from './cataloguePageTypes';

interface Props {
  readonly onOpenChange: (open: boolean) => void;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly target: ArchiveTarget | null;
}

/** Confirms an archive operation without deleting the immutable definition identity. */
export function ArchiveCatalogueDialog({ onOpenChange, onOperation, target }: Props) {
  function archive(): void {
    if (target === null) return;
    const operation: CatalogueOperation =
      target.kind === 'type'
        ? { kind: 'archive_type', id: target.id }
        : { kind: 'archive_field', id: target.id };
    onOpenChange(false);
    onOperation(operation);
  }
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {target?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            The definition remains readable by existing items and its key cannot be reused.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={archive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
