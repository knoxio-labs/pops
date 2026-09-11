import { useCallback, useMemo, useState } from 'react';

import { useImportStore } from '../../../store/importStore';
import { assembleTagReviewOutput } from './assembleTagReviewOutput';
import { groupByEntity } from './tagReviewUtils';
import { usePreviewTransactions } from './usePreviewTransactions';
import { useTagActions } from './useTagReviewActions';
import { useTagRuleDialog } from './useTagRuleDialog';
import { useTagRuleHandler } from './useTagRuleHandler';
import { useAvailableTags, useTagFacets, useVocabularyTags } from './useTagTaxonomy';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { ImportStore as ImportStoreType } from '../../../store/import-store-types';
import type { UseTagReviewStateOutput } from './tagReviewStateTypes';

export type { UseTagReviewStateOutput, PreviewTransaction } from './tagReviewStateTypes';

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
  const [prevConfirmedTransactions, setPrevConfirmedTransactions] = useState(confirmedTransactions);

  if (confirmedTransactions !== prevConfirmedTransactions) {
    setPrevConfirmedTransactions(confirmedTransactions);
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
  }

  return { localTags, setLocalTags, suggestedTagMeta, setSuggestedTagMeta };
}

interface TagRuleWorkflowDeps {
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
  addPendingTagRuleChangeSet: ImportStoreType['addPendingTagRuleChangeSet'];
}

/** The tag-rule dialog and the handler that folds an applied rule back into local state. */
function useTagRuleWorkflow(deps: TagRuleWorkflowDeps) {
  const {
    localTags,
    suggestedTagMeta,
    setLocalTags,
    setSuggestedTagMeta,
    addPendingTagRuleChangeSet,
  } = deps;
  const dialog = useTagRuleDialog(localTags);
  const handleTagRuleApplied = useTagRuleHandler({
    addPendingTagRuleChangeSet,
    dialogGroupNameRef: dialog.dialogGroupNameRef,
    dialogSourceChecksumsRef: dialog.dialogSourceChecksumsRef,
    setLocalTags,
    setSuggestedTagMeta,
    suggestedTagMeta,
  });
  return { dialog, handleTagRuleApplied };
}

/** Flushes the step's working copy of the tags into the store before advancing. */
function useHandleContinue(
  localTags: Record<string, string[]>,
  updateTransactionTags: ImportStoreType['updateTransactionTags'],
  nextStep: () => void
) {
  return useCallback(() => {
    for (const [checksum, tags] of Object.entries(localTags)) updateTransactionTags(checksum, tags);
    nextStep();
  }, [localTags, updateTransactionTags, nextStep]);
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
  const facets = useTagFacets();
  const vocabularyTags = useVocabularyTags();

  const tagActions = useTagActions({
    localTags,
    setLocalTags,
    suggestedTagMeta,
    confirmedTransactions,
  });
  const handleContinue = useHandleContinue(localTags, updateTransactionTags, nextStep);
  const { dialog, handleTagRuleApplied } = useTagRuleWorkflow({
    localTags,
    suggestedTagMeta,
    setLocalTags,
    setSuggestedTagMeta,
    addPendingTagRuleChangeSet,
  });
  const previewTransactions = usePreviewTransactions({
    confirmedTransactions,
    localTags,
    suggestedTagMeta,
  });

  return assembleTagReviewOutput({
    confirmedTransactions,
    groups,
    availableTags,
    facets,
    vocabularyTags,
    localTags,
    suggestedTagMeta,
    tagActions,
    handleContinue,
    prevStep,
    dialog,
    previewTransactions,
    handleTagRuleApplied,
  });
}
