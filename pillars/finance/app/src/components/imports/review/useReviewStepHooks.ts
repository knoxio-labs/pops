import { useCallback, useMemo } from 'react';

import { useImportStore } from '../../../store/importStore';
import { useBulkAssignment } from '../hooks/useBulkAssignment';
import { useProposalGeneration } from '../hooks/useProposalGeneration';
import { useSuggestedTagRecompute } from '../hooks/useSuggestedTagRecompute';
import { useTransactionEditing } from '../hooks/useTransactionEditing';
import { useTransactionReview } from '../hooks/useTransactionReview';
import { buildConfirmedTransactions, partitionConfirmable } from './buildConfirmed';
import { useReviewActions } from './useReviewActions';

import type { ProcessedTransaction } from '../../../store/importStore';

/**
 * The matched bucket split into what actually commits and what would be
 * dropped for want of a merchant, plus the handoff that freezes the former
 * into the confirmed set. The footer count, the drop notice and the commit all
 * read this one partition, so they can never disagree (#3765).
 */
function useReviewCommit(matched: ProcessedTransaction[]) {
  const { setConfirmedTransactions, nextStep } = useImportStore();
  const { confirmed, dropped } = useMemo(() => partitionConfirmable(matched), [matched]);
  const continueToTagReview = useCallback(() => {
    setConfirmedTransactions(buildConfirmedTransactions(matched));
    nextStep();
  }, [matched, setConfirmedTransactions, nextStep]);
  return { confirmed, dropped, continueToTagReview };
}

export function useReviewStepHooks() {
  const { findSimilar } = useImportStore();
  const review = useTransactionReview();
  const proposal = useProposalGeneration();
  const { recomputeForEntity, isRecomputingTags } = useSuggestedTagRecompute({
    setLocalTransactions: review.setLocalTransactions,
  });
  const reviewActions = useReviewActions({
    setLocalTransactions: review.setLocalTransactions,
    findSimilar,
    generateProposal: proposal.generateProposal,
    recomputeForEntity,
  });
  const editing = useTransactionEditing({
    setLocalTransactions: review.setLocalTransactions,
    generateProposal: proposal.generateProposal,
    recomputeForEntity,
  });
  const bulk = useBulkAssignment({
    setLocalTransactions: review.setLocalTransactions,
    handleEntitySelect: reviewActions.handleEntitySelect,
    openRuleProposalDialog: proposal.openRuleProposalDialog,
    generateProposal: proposal.generateProposal,
    recomputeForEntity,
  });
  const commit = useReviewCommit(review.localTransactions.matched);
  return { review, proposal, reviewActions, editing, bulk, commit, isRecomputingTags };
}
