import { useCallback, useMemo } from 'react';

import { useImportStore } from '../../store/importStore';
import { buildConfirmedTransactions, partitionConfirmable } from './review/buildConfirmed';
import { DroppedRowsNotice } from './review/DroppedRowsNotice';
import { ReviewFooter, ReviewHeader } from './review/ReviewChrome';
import { ReviewDialogs } from './review/ReviewDialogs';
import { ReviewTabs } from './review/ReviewTabs';
import { ReviewWarnings } from './review/ReviewWarnings';
import { useReviewStepHooks } from './review/useReviewStepHooks';

import type { LocalTxState } from './hooks/local-tx-reconcile';

/** Flatten every bucket to the `{ checksum, description }` list the dialogs preview against. */
function toPreviewList(local: LocalTxState) {
  return [...local.matched, ...local.uncertain, ...local.failed, ...local.skipped].map((t) => ({
    checksum: t.checksum,
    description: t.description,
  }));
}

/**
 * Step 4: Review transactions and resolve uncertain/failed matches
 */
export function ReviewStep() {
  const { processedTransactions, processSessionId, setConfirmedTransactions, nextStep, goToStep } =
    useImportStore();
  const { review, proposal, reviewActions, editing, bulk } = useReviewStepHooks();

  // The matched bucket splits into what actually commits and what would be
  // dropped for want of a merchant. Both the footer count and the drop notice
  // read from this one partition so they can never disagree with the commit (#3765).
  const { confirmed, dropped } = useMemo(
    () => partitionConfirmable(review.localTransactions.matched),
    [review.localTransactions.matched]
  );

  const handleContinueToTagReview = useCallback(() => {
    setConfirmedTransactions(buildConfirmedTransactions(review.localTransactions.matched));
    nextStep();
  }, [review.localTransactions.matched, setConfirmedTransactions, nextStep]);

  const allPreviewTransactions = toPreviewList(review.localTransactions);

  return (
    <div className="space-y-6">
      <ReviewDialogs
        proposal={proposal}
        bulk={bulk}
        review={review}
        processSessionId={processSessionId ?? ''}
        allPreviewTransactions={allPreviewTransactions}
      />
      <ReviewHeader
        isReevaluating={review.isReevaluating}
        unresolvedCount={review.unresolvedCount}
        browseOpen={proposal.browseOpen}
        setBrowseOpen={proposal.setBrowseOpen}
      />
      <ReviewWarnings warnings={processedTransactions.warnings} />
      <DroppedRowsNotice count={dropped.length} />
      <ReviewTabs
        activeTab={review.activeTab}
        onTabChange={review.handleTabChange}
        localTransactions={review.localTransactions}
        uncertainGroups={review.uncertainGroups}
        failedGroups={review.failedGroups}
        viewMode={review.viewMode}
        setViewMode={review.setViewMode}
        editingTransaction={editing.editingTransaction}
        handleEdit={editing.handleEdit}
        handleSaveEdit={editing.handleSaveEdit}
        handleCancelEdit={editing.handleCancelEdit}
        handleEntitySelect={reviewActions.handleEntitySelect}
        handleBulkEntitySelect={reviewActions.handleBulkEntitySelect}
        handleCreateEntityWithName={bulk.handleCreateEntityWithName}
        handleAcceptAiSuggestion={bulk.handleAcceptAiSuggestion}
        handleAcceptAll={bulk.handleAcceptAll}
        handleCreateAndAssignAll={bulk.handleCreateAndAssignAll}
        entities={bulk.entities}
      />
      <ReviewFooter
        unresolvedCount={review.unresolvedCount}
        committedCount={confirmed.length}
        onBack={() => goToStep(2)}
        onContinue={handleContinueToTagReview}
      />
    </div>
  );
}
