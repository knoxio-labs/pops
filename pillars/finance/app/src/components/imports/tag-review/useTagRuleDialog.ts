import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unionTags } from './tagReviewUtils';

import type { ConfirmedTransaction } from '@pops/finance';

import type { TagRuleLearnSignal } from '../TagRuleProposalDialog';
import type { ConfirmedGroup } from './tagReviewUtils';

export interface TagRuleDialogState {
  signal: TagRuleLearnSignal;
  groupEntityName: string;
  /** The rows the dialog's tags were read from, carried so the staged rule can be re-checked against them (POPS-3106). */
  sourceChecksums: string[];
}

/** `null` when the group carries no tags yet, so there is no rule to propose. */
function groupDialogState(
  group: ConfirmedGroup,
  localTags: Record<string, string[]>
): TagRuleDialogState | null {
  const tags = unionTags(group.transactions.map((t) => localTags[t.checksum] ?? []));
  if (tags.length === 0) return null;
  const signal: TagRuleLearnSignal = {
    descriptionPattern: group.entityName,
    matchType: 'contains',
    entityId: group.transactions[0]?.entityId ?? null,
    tags,
  };
  return {
    signal,
    groupEntityName: group.entityName,
    sourceChecksums: group.transactions.map((t) => t.checksum),
  };
}

function transactionDialogState(
  transaction: ConfirmedTransaction,
  tags: string[]
): TagRuleDialogState | null {
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

export function useTagRuleDialog(localTags: Record<string, string[]>) {
  const [tagRuleDialog, setTagRuleDialog] = useState<TagRuleDialogState | null>(null);
  const { dialogGroupNameRef, dialogSourceChecksumsRef } = useDialogContextRefs(tagRuleDialog);

  const handleOpenTagRuleDialog = useCallback(
    (group: ConfirmedGroup) => {
      const next = groupDialogState(group, localTags);
      if (!next) {
        toast.info('Add at least one tag to this group before saving a rule.');
        return;
      }
      setTagRuleDialog(next);
    },
    [localTags]
  );

  const handleOpenTagRuleDialogForTransaction = useCallback(
    (transaction: ConfirmedTransaction, tags: string[]) => {
      const next = transactionDialogState(transaction, tags);
      if (!next) {
        toast.info('Add at least one tag to this transaction before saving a rule.');
        return;
      }
      setTagRuleDialog(next);
    },
    []
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
