import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { transactionsAvailableTags } from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';
import { groupByEntity } from './tagReviewUtils';
import { type PreviewTransaction, usePreviewTransactions } from './usePreviewTransactions';
import {
  applyAffectedToLocalTags,
  applyAffectedToSuggested,
  useTagActions,
} from './useTagReviewActions';
import { type TagRuleDialogState, useTagRuleDialog } from './useTagRuleDialog';

import type {
  ConfirmedTransaction,
  SuggestedTag,
  TagRuleChangeSet,
  TagRuleImpactItem,
} from '@pops/finance';

import type { ImportStore as ImportStoreType } from '../../../store/import-store-types';
import type { ConfirmedGroup } from './tagReviewUtils';

export interface UseTagReviewStateOutput {
  confirmedTransactions: ConfirmedTransaction[];
  groups: ConfirmedGroup[];
  availableTags: string[];
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  updateTag: (checksum: string, tags: string[]) => void;
  handleAcceptAll: () => void;
  /** Rows an accept-all would change; zero means the control is inert. */
  unappliedSuggestionCount: number;
  handleApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
  handleContinue: () => void;
  prevStep: () => void;
  confirmedCount: number;
  tagRuleDialog: TagRuleDialogState | null;
  setTagRuleDialogOpen: (open: boolean) => void;
  handleOpenTagRuleDialog: (group: ConfirmedGroup) => void;
  handleOpenTagRuleDialogForTransaction: (
    transaction: ConfirmedTransaction,
    tags: string[]
  ) => void;
  previewTransactions: PreviewTransaction[];
  handleTagRuleApplied: (
    changeSet: TagRuleChangeSet,
    affected: TagRuleImpactItem[],
    acceptedNewTags: string[]
  ) => void;
}

export type { PreviewTransaction };

interface LocalTagsState {
  localTags: Record<string, string[]>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
}

function useLocalTagsSync(confirmedTransactions: ConfirmedTransaction[]): LocalTagsState {
  const [localTags, setLocalTags] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.tags ?? []]))
  );
  const [suggestedTagMeta, setSuggestedTagMeta] = useState<Record<string, SuggestedTag[]>>(() =>
    Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []]))
  );

  useEffect(() => {
    setLocalTags((prev) => {
      const next = { ...prev };
      for (const t of confirmedTransactions) next[t.checksum] ??= t.tags ?? [];
      const keys = new Set(confirmedTransactions.map((t) => t.checksum));
      for (const k of Object.keys(next)) if (!keys.has(k)) delete next[k];
      return next;
    });
    setSuggestedTagMeta(
      Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []]))
    );
  }, [confirmedTransactions]);

  return { localTags, setLocalTags, suggestedTagMeta, setSuggestedTagMeta };
}

function useAvailableTags(localTags: Record<string, string[]>): string[] {
  const { data } = useQuery({
    queryKey: ['finance', 'transactions', 'availableTags'],
    queryFn: async () => unwrap(await transactionsAvailableTags()),
  });
  const serverTags = data?.tags;
  return useMemo(() => {
    const local = Object.values(localTags).flat();
    return [...new Set([...(serverTags ?? []), ...local])].toSorted();
  }, [serverTags, localTags]);
}

function useTagRuleHandler(args: {
  addPendingTagRuleChangeSet: ImportStoreType['addPendingTagRuleChangeSet'];
  dialogGroupNameRef: React.MutableRefObject<string | null>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
}) {
  const {
    addPendingTagRuleChangeSet,
    dialogGroupNameRef,
    setLocalTags,
    setSuggestedTagMeta,
    suggestedTagMeta,
  } = args;
  return useCallback(
    (changeSet: TagRuleChangeSet, affected: TagRuleImpactItem[], acceptedNewTags: string[]) => {
      addPendingTagRuleChangeSet({
        changeSet,
        source: `tag-review:${dialogGroupNameRef.current ?? 'unknown'}`,
        acceptedNewTags,
      });
      if (affected.length === 0) return;
      setLocalTags((prev) => applyAffectedToLocalTags(prev, affected, suggestedTagMeta));
      setSuggestedTagMeta((prev) => applyAffectedToSuggested(prev, affected));
    },
    [
      addPendingTagRuleChangeSet,
      dialogGroupNameRef,
      setLocalTags,
      setSuggestedTagMeta,
      suggestedTagMeta,
    ]
  );
}

export function useTagReviewState(): UseTagReviewStateOutput {
  const store = useImportStore();
  const {
    confirmedTransactions,
    updateTransactionTags,
    nextStep,
    prevStep,
    addPendingTagRuleChangeSet,
  } = store;

  const { localTags, setLocalTags, suggestedTagMeta, setSuggestedTagMeta } =
    useLocalTagsSync(confirmedTransactions);

  const groups = useMemo(() => groupByEntity(confirmedTransactions), [confirmedTransactions]);
  const availableTags = useAvailableTags(localTags);

  const { updateTag, handleAcceptAll, handleApplyGroupTags, unappliedSuggestionCount } =
    useTagActions({
      localTags,
      setLocalTags,
      suggestedTagMeta,
      confirmedTransactions,
    });

  const handleContinue = useCallback(() => {
    for (const [checksum, tags] of Object.entries(localTags)) updateTransactionTags(checksum, tags);
    nextStep();
  }, [localTags, updateTransactionTags, nextStep]);

  const dialog = useTagRuleDialog(localTags);
  const handleTagRuleApplied = useTagRuleHandler({
    addPendingTagRuleChangeSet,
    dialogGroupNameRef: dialog.dialogGroupNameRef,
    setLocalTags,
    setSuggestedTagMeta,
    suggestedTagMeta,
  });

  const previewTransactions = usePreviewTransactions({
    confirmedTransactions,
    localTags,
    suggestedTagMeta,
  });

  return {
    confirmedTransactions,
    groups,
    availableTags,
    localTags,
    suggestedTagMeta,
    updateTag,
    handleAcceptAll,
    unappliedSuggestionCount,
    handleApplyGroupTags,
    handleContinue,
    prevStep,
    confirmedCount: confirmedTransactions.length,
    tagRuleDialog: dialog.tagRuleDialog,
    setTagRuleDialogOpen: dialog.setTagRuleDialogOpen,
    handleOpenTagRuleDialog: dialog.handleOpenTagRuleDialog,
    handleOpenTagRuleDialogForTransaction: dialog.handleOpenTagRuleDialogForTransaction,
    previewTransactions,
    handleTagRuleApplied,
  };
}
