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

import { descendantIds } from '../lib/type-tree';

import type { CatalogueOperation, CatalogueType } from '../catalogue-editor/types';
import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { ArchiveTarget } from './cataloguePageTypes';

interface Props {
  readonly issues?: readonly InventoryApiIssue[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly target: ArchiveTarget | null;
  readonly types?: readonly CatalogueType[];
}

const EMPTY_ISSUES: readonly InventoryApiIssue[] = [];
const EMPTY_TYPES: readonly CatalogueType[] = [];

function blockingChildren(
  target: ArchiveTarget | null,
  issues: readonly InventoryApiIssue[],
  types: readonly CatalogueType[]
): CatalogueType[] {
  if (target?.kind !== 'type') return [];
  const childIdSet = new Set(descendantIds(types, target.id));
  const liveChildren = types.filter((type) => childIdSet.has(type.id) && type.archivedAt === null);
  const serverReportedChildren = issues
    .filter((issue) => issue.code === 'type_parent_archived' && issue.definitionId !== null)
    .flatMap((issue) => {
      const type = types.find((candidate) => candidate.id === issue.definitionId);
      return type === undefined ? [] : [type];
    });
  return [
    ...new Map(
      [...liveChildren, ...serverReportedChildren].map((type) => [type.id, type])
    ).values(),
  ];
}

/** Confirms an archive operation without deleting the immutable definition identity. */
export function ArchiveCatalogueDialog({
  issues = EMPTY_ISSUES,
  onOpenChange,
  onOperation,
  target,
  types = EMPTY_TYPES,
}: Props) {
  const blocking = blockingChildren(target, issues, types);
  const hasBlockingChildren = target?.kind === 'type' && blocking.length > 0;
  function archive(): void {
    if (target === null || hasBlockingChildren) return;
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
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={archive} disabled={hasBlockingChildren}>
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
