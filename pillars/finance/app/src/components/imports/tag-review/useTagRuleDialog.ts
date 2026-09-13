import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { derivePatternFromDescriptions } from '@pops/finance';

import { withoutMarkerTags } from '../../../lib/tags';
import { unionTags } from './tagReviewUtils';

import type { ConfirmedTransaction } from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';
import type { TagRuleLearnSignal } from '../TagRuleProposalDialog';
import type { ConfirmedGroup } from './tagReviewUtils';

export interface TagRuleDialogState {
  signal: TagRuleLearnSignal;
  groupEntityName: string;
  /** The rows the dialog's tags were read from, carried so the staged rule can be re-checked against them (POPS-3106). */
  sourceChecksums: string[];
}

/** `null` when the group carries no rule-writable tags yet, so there is no rule to propose. */
function groupDialogState(
  group: ConfirmedGroup,
  localTags: Record<string, string[]>,
  facets: readonly TagFacetOption[]
): TagRuleDialogState | null {
  const tags = withoutMarkerTags(
    unionTags(group.transactions.map((t) => localTags[t.checksum] ?? [])),
    facets
  );
  if (tags.length === 0) return null;
  // From the descriptors, never the entity name: a rule is tested against what
  // the bank sent, and a merchant's display name is routinely not a substring
  // of it, so a name-seeded rule can never fire (POPS-255).
  const descriptionPattern = derivePatternFromDescriptions(
    group.transactions.map((t) => t.description)
  );
  const signal: TagRuleLearnSignal = {
    descriptionPattern: descriptionPattern ?? '',
    matchType: 'contains',
    entityId: group.transactions[0]?.entityId ?? null,
    tags,
    noCommonDescriptor: descriptionPattern === null,
  };
  return {
    signal,
    groupEntityName: group.entityName,
    sourceChecksums: group.transactions.map((t) => t.checksum),
  };
}

function transactionDialogState(
  transaction: ConfirmedTransaction,
  rowTags: string[],
  facets: readonly TagFacetOption[]
): TagRuleDialogState | null {
  const tags = withoutMarkerTags(rowTags, facets);
  if (tags.length === 0) return null;
  const signal: TagRuleLearnSignal = {
    descriptionPattern: transaction.description,
    matchType: 'contains',
    entityId: transaction.entityId ?? null,
    tags,
  };
  return {
    signal,
    groupEntityName: transaction.description,
    sourceChecksums: [transaction.checksum],
  };
}

/**
 * The open dialog's provenance, held in refs because `onApplied` fires against
 * a dialog the close has already cleared from state.
 */
function useDialogContextRefs(tagRuleDialog: TagRuleDialogState | null) {
  const dialogGroupNameRef = useRef<string | null>(null);
  const dialogSourceChecksumsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!tagRuleDialog) return;
    dialogGroupNameRef.current = tagRuleDialog.groupEntityName;
    dialogSourceChecksumsRef.current = tagRuleDialog.sourceChecksums;
  }, [tagRuleDialog]);
  return { dialogGroupNameRef, dialogSourceChecksumsRef };
}

/**
 * The Tag Review step's "Save tag rule…" dialog state. A proposed rule never
 * carries a `marker`-facet tag (POPS-3704), so `facets` must be the loaded
 * taxonomy; a group or row whose only tags are markers proposes nothing.
 */
export function useTagRuleDialog(
  localTags: Record<string, string[]>,
  facets: readonly TagFacetOption[]
) {
  const [tagRuleDialog, setTagRuleDialog] = useState<TagRuleDialogState | null>(null);
  const { dialogGroupNameRef, dialogSourceChecksumsRef } = useDialogContextRefs(tagRuleDialog);

  const handleOpenTagRuleDialog = useCallback(
    (group: ConfirmedGroup) => {
      const next = groupDialogState(group, localTags, facets);
      if (!next) {
        toast.info('Add at least one tag to this group before saving a rule.');
        return;
      }
      setTagRuleDialog(next);
    },
    [localTags, facets]
  );

  const handleOpenTagRuleDialogForTransaction = useCallback(
    (transaction: ConfirmedTransaction, tags: string[]) => {
      const next = transactionDialogState(transaction, tags, facets);
      if (!next) {
        toast.info('Add at least one tag to this transaction before saving a rule.');
        return;
      }
      setTagRuleDialog(next);
    },
    [facets]
  );

  const setTagRuleDialogOpen = useCallback((open: boolean) => {
    if (!open) setTagRuleDialog(null);
  }, []);

  return {
    tagRuleDialog,
    dialogGroupNameRef,
    dialogSourceChecksumsRef,
    handleOpenTagRuleDialog,
    handleOpenTagRuleDialogForTransaction,
    setTagRuleDialogOpen,
  };
}
