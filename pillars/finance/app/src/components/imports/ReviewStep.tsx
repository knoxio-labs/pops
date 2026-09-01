import { useImportStore } from '../../store/importStore';
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
  const { processedTransactions, processSessionId, goToStep } = useImportStore();
  const { review, proposal, reviewActions, editing, bulk, commit, isRecomputingTags } =
    useReviewStepHooks();

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
      <DroppedRowsNotice dropped={commit.dropped} />
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
        committedCount={commit.confirmed.length}
        onBack={() => goToStep(2)}
        onContinue={commit.continueToTagReview}
        isRecomputingTags={isRecomputingTags}
      />
    </div>
  );
}
