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
import { ArchiveReplacementControl } from './ArchiveReplacementControl';

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
const NO_REPLACEMENT = '';

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

/** Confirms an archive and can record lineage to an eligible live replacement. */
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
  async function archive(replacementId: string): Promise<void> {
    if (target === null || hasBlockingChildren || isSubmitting) return;
    const operation: CatalogueOperation =
      target.kind === 'type'
        ? {
            kind: 'archive_type',
            id: target.id,
            ...(replacementId === NO_REPLACEMENT ? {} : { replacedBy: replacementId }),
          }
        : {
            kind: 'archive_field',
            id: target.id,
            ...(replacementId === NO_REPLACEMENT ? {} : { replacedBy: replacementId }),
          };
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
        issueSources={issueSources}
        isSubmitting={isSubmitting}
        onArchive={archive}
        target={target}
        types={types}
        key={target === null ? 'closed' : `${target.kind}:${target.id}`}
      />
    </AlertDialog>
  );
}

function ArchiveDialogContent({
  blocking,
  hasBlockingChildren,
  issueSources,
  isSubmitting,
  onArchive,
  target,
  types,
}: {
  readonly blocking: readonly CatalogueType[];
  readonly hasBlockingChildren: boolean;
  readonly issueSources: CatalogueIssueSources;
  readonly isSubmitting: boolean;
  readonly onArchive: (replacementId: string) => Promise<void>;
  readonly target: ArchiveTarget | null;
  readonly types: readonly CatalogueType[];
}) {
  const [replacementId, setReplacementId] = useState(NO_REPLACEMENT);
  return (
    <AlertDialogContent>
      <ArchiveDialogMessage
        blocking={blocking}
        hasBlockingChildren={hasBlockingChildren}
        target={target}
      />
      {target !== null && !hasBlockingChildren && (
        <ArchiveReplacementControl
          issueSources={issueSources}
          onChange={setReplacementId}
          target={target}
          types={types}
          value={replacementId}
          disabled={isSubmitting}
        />
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={hasBlockingChildren || isSubmitting}
          onClick={(event) => {
            event.preventDefault();
            void onArchive(replacementId);
          }}
        >
          Archive
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function ArchiveDialogMessage({
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
