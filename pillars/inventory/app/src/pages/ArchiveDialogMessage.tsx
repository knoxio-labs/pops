import { AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@pops/ui';

import type { CatalogueType } from '../catalogue-editor/types';
import type { ArchiveTarget } from './cataloguePageTypes';

/** Explains the archive action and any live child types that prevent it. */
export function ArchiveDialogMessage({
  blocking,
  hasBlockingChildren,
  target,
}: {
  readonly blocking: readonly CatalogueType[];
  readonly hasBlockingChildren: boolean;
  readonly target: ArchiveTarget | null;
}) {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>Archive {target?.label}?</AlertDialogTitle>
      {hasBlockingChildren ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <AlertDialogDescription>
            Move or archive the live children first. The archived descendants do not block this
            action.
          </AlertDialogDescription>
          <div>
            <span className="font-medium text-foreground">Live children</span>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {blocking.map((child) => (
                <li key={child.id}>{child.label}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <AlertDialogDescription>
          The definition remains readable by existing items and its key cannot be reused.
        </AlertDialogDescription>
      )}
    </AlertDialogHeader>
  );
}
