import { useState } from 'react';

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

import type {
  CatalogueIssueSources,
  CatalogueOperation,
  CatalogueOperationHandler,
  CatalogueType,
} from '../catalogue-editor/types';
import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { ArchiveTarget } from './cataloguePageTypes';

interface Props {
  readonly issueSources?: CatalogueIssueSources;
  readonly issues?: readonly InventoryApiIssue[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onOperation: CatalogueOperationHandler;
  readonly target: ArchiveTarget | null;
  readonly types?: readonly CatalogueType[];
}

const EMPTY_ISSUES: readonly InventoryApiIssue[] = [];
const EMPTY_ISSUE_SOURCES: CatalogueIssueSources = [];
const EMPTY_TYPES: readonly CatalogueType[] = [];

function blockingChildren(
  target: ArchiveTarget | null,
  issues: readonly InventoryApiIssue[],
  types: readonly CatalogueType[],
  issueSources: CatalogueIssueSources
): CatalogueType[] {
  if (target?.kind !== 'type') return [];
  const childIdSet = new Set(descendantIds(types, target.id));
  const liveChildren = types.filter((type) => childIdSet.has(type.id) && type.archivedAt === null);
  const serverReportedChildren = issues
    .filter(
      (issue) =>
        issue.code === 'type_parent_archived' &&
        issue.definitionId !== null &&
        issueSources.some(
          (source) =>
            source.issues.includes(issue) &&
            source.operations?.some(
              (operation) => operation.kind === 'archive_type' && operation.id === target.id
            ) === true
        )
    )
    .flatMap((issue) => {
      const type = types.find(
        (candidate) => candidate.id === issue.definitionId && candidate.archivedAt === null
      );
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
  issueSources = EMPTY_ISSUE_SOURCES,
  issues = EMPTY_ISSUES,
  onOpenChange,
  onOperation,
  target,
  types = EMPTY_TYPES,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const blocking = blockingChildren(target, issues, types, issueSources);
  const hasBlockingChildren = target?.kind === 'type' && blocking.length > 0;
  async function archive(): Promise<void> {
    if (target === null || hasBlockingChildren || isSubmitting) return;
    const operation: CatalogueOperation =
      target.kind === 'type'
        ? { kind: 'archive_type', id: target.id }
        : { kind: 'archive_field', id: target.id };
    setIsSubmitting(true);
    try {
      const result = await onOperation(operation);
      if (result !== false) onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <ArchiveDialogContent
        blocking={blocking}
        hasBlockingChildren={hasBlockingChildren}
        isSubmitting={isSubmitting}
        onArchive={archive}
        target={target}
      />
    </AlertDialog>
  );
}

function ArchiveDialogContent({
  blocking,
  hasBlockingChildren,
  isSubmitting,
  onArchive,
  target,
}: {
  readonly blocking: readonly CatalogueType[];
  readonly hasBlockingChildren: boolean;
  readonly isSubmitting: boolean;
  readonly onArchive: () => Promise<void>;
  readonly target: ArchiveTarget | null;
}) {
  return (
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
        <AlertDialogAction
          disabled={hasBlockingChildren || isSubmitting}
          onClick={(event) => {
            event.preventDefault();
            void onArchive();
          }}
        >
          Archive
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
