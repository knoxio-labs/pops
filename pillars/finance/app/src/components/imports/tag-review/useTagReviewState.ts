import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesFacets, transactionsAvailableTags } from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';
import { assembleTagReviewOutput } from './assembleTagReviewOutput';
import { groupByEntity } from './tagReviewUtils';
import { usePreviewTransactions } from './usePreviewTransactions';
import { useTagActions } from './useTagReviewActions';
import { useTagRuleDialog } from './useTagRuleDialog';
import { useTagRuleHandler } from './useTagRuleHandler';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';
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

/**
 * The taxonomy the pickers offer to create tags on.
 *
 * Fetched rather than hard-coded so a facet added to the pillar reaches the UI
 * without a matching edit here; an unanswered query yields no axes, which the
 * pickers read as "nothing may be created yet" rather than falling back to a
 * guessed list.
 */
function useTagFacets(): TagFacetOption[] {
  const { data } = useQuery({
    queryKey: ['finance', 'tagRules', 'facets'],
    queryFn: async () => unwrap(await tagRulesFacets()),
  });
  return data?.facets ?? [];
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
