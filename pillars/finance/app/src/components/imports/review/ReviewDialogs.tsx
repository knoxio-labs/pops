import { toast } from 'sonner';

import { toRestSignal } from '../../../lib/rest-changeset';
import { useImportStore } from '../../../store/importStore';
import { CorrectionProposalDialog } from '../CorrectionProposalDialog';
import { EntityCreateDialog } from '../EntityCreateDialog';
import { useReevaluatePending } from '../hooks/useReevaluatePending';

import type { useBulkAssignment } from '../hooks/useBulkAssignment';
import type { useProposalGeneration } from '../hooks/useProposalGeneration';
import type { useTransactionReview } from '../hooks/useTransactionReview';

interface BrowseDialogProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  sessionId: string;
  previewTransactions: Array<{ checksum: string; description: string }>;
  applyReevaluatedResult: ReturnType<typeof useTransactionReview>['applyReevaluatedResult'];
}

function BrowseDialog({
  open,
  setOpen,
  sessionId,
  previewTransactions,
  applyReevaluatedResult,
}: BrowseDialogProps) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const { runReevaluate } = useReevaluatePending();
  const onClose = (hadChanges: boolean) => {
    if (!hadChanges || !sessionId || pendingChangeSets.length === 0) return;
    void runReevaluate().then((outcome) => {
      if (!outcome) return;
      applyReevaluatedResult(outcome.result);
      toast.success(
        `Rules applied — ${outcome.affectedCount} transaction${outcome.affectedCount === 1 ? '' : 's'} re-evaluated`
      );
    });
  };
  return (
    <CorrectionProposalDialog
      open={open}
      onOpenChange={setOpen}
      mode="browse"
      sessionId={sessionId}
      signal={null}
      triggeringTransaction={null}
      previewTransactions={previewTransactions}
      onBrowseClose={onClose}
    />
  );
}

interface DialogsProps {
  proposal: ReturnType<typeof useProposalGeneration>;
  bulk: ReturnType<typeof useBulkAssignment>;
  review: ReturnType<typeof useTransactionReview>;
  processSessionId: string;
  allPreviewTransactions: Array<{ checksum: string; description: string }>;
}

export function ReviewDialogs({
  proposal,
  bulk,
  review,
  processSessionId,
  allPreviewTransactions,
}: DialogsProps) {
  return (
    <>
      <CorrectionProposalDialog
        open={proposal.proposalOpen}
        onOpenChange={proposal.handleProposalOpenChange}
        sessionId={processSessionId}
        signal={proposal.proposalSignal ? toRestSignal(proposal.proposalSignal) : null}
        triggeringTransaction={proposal.proposalTriggeringTransaction}
        previewTransactions={allPreviewTransactions}
        generating={proposal.isGeneratingProposal}
        patternConfidence={proposal.proposalConfidence}
        onApproved={() => toast.success('Rules saved locally')}
      />
      <BrowseDialog
        open={proposal.browseOpen}
        setOpen={proposal.setBrowseOpen}
        sessionId={processSessionId}
        previewTransactions={allPreviewTransactions}
        applyReevaluatedResult={review.applyReevaluatedResult}
      />
      <EntityCreateDialog
        open={bulk.showCreateDialog}
        onOpenChange={(open) => {
          bulk.setShowCreateDialog(open);
          if (!open) {
            bulk.setPendingBulkTransactions(null);
            bulk.setSelectedTransaction(null);
          }
        }}
        onEntityCreated={bulk.handleEntityCreated}
        suggestedName={bulk.selectedTransaction?.entity?.entityName}
        dbEntities={bulk.dbEntitiesData?.data}
      />
    </>
  );
}
