import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';
import type { ConfirmedGroup } from './tagReviewUtils';
import type { PreviewTransaction } from './usePreviewTransactions';
import type { useTagActions } from './useTagReviewActions';
import type { UseTagReviewStateOutput } from './useTagReviewState';
import type { useTagRuleDialog } from './useTagRuleDialog';

interface AssembleOutputArgs {
  confirmedTransactions: ConfirmedTransaction[];
  groups: ConfirmedGroup[];
  availableTags: string[];
  facets: TagFacetOption[];
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  tagActions: ReturnType<typeof useTagActions>;
  handleContinue: () => void;
  prevStep: () => void;
  dialog: ReturnType<typeof useTagRuleDialog>;
  previewTransactions: PreviewTransaction[];
  handleTagRuleApplied: UseTagReviewStateOutput['handleTagRuleApplied'];
}

/** Shapes the step's public API out of the pieces `useTagReviewState` gathers. */
export function assembleTagReviewOutput(args: AssembleOutputArgs): UseTagReviewStateOutput {
  const { confirmedTransactions, groups, availableTags, facets, localTags, suggestedTagMeta } =
    args;
  const {
    tagActions,
    handleContinue,
    prevStep,
    dialog,
    previewTransactions,
    handleTagRuleApplied,
  } = args;
  return {
    confirmedTransactions,
    groups,
    availableTags,
    facets,
    localTags,
    suggestedTagMeta,
    ...tagActions,
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
