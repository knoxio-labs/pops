import { toast } from 'sonner';

import { toRestSignal } from '../../../lib/rest-changeset';
import { CorrectionProposalDialog } from '../CorrectionProposalDialog';
import { EntityCreateDialog } from '../EntityCreateDialog';
import { toastRulesApplied, useReevaluatePending } from '../hooks/useReevaluatePending';

import type { PreviewTransactionEntry } from '../correction-proposal-shared';
import type { useBulkAssignment } from '../hooks/useBulkAssignment';
import type { useProposalGeneration } from '../hooks/useProposalGeneration';
import type { ReevaluateVia } from '../hooks/useReevaluatePending';
import type { useTransactionReview } from '../hooks/useTransactionReview';

interface BrowseDialogProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  reevaluateVia: ReevaluateVia;
  previewTransactions: PreviewTransactionEntry[];
  applyReevaluatedResult: ReturnType<typeof useTransactionReview>['applyReevaluatedResult'];
}

function BrowseDialog({
  open,
  setOpen,
  reevaluateVia,
  previewTransactions,
  applyReevaluatedResult,
}: BrowseDialogProps) {
  const { runReevaluate } = useReevaluatePending();
  const onClose = (hadChanges: boolean) => {
    if (!hadChanges || !reevaluateVia) return;
    void runReevaluate().then((outcome) => {
      if (!outcome) return;
      applyReevaluatedResult(outcome.result);
      toastRulesApplied(outcome.affectedCount);
    });
  };
  return (
    <CorrectionProposalDialog
      open={open}
      onOpenChange={setOpen}
      mode="browse"
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
  allPreviewTransactions: PreviewTransactionEntry[];
}

export function ReviewDialogs({ proposal, bulk, review, allPreviewTransactions }: DialogsProps) {
  return (
    <>
      <CorrectionProposalDialog
        open={proposal.proposalOpen}
        onOpenChange={proposal.handleProposalOpenChange}
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
        reevaluateVia={review.reevaluateVia}
        previewTransactions={allPreviewTransactions}
        applyReevaluatedResult={review.applyReevaluatedResult}
      />
      <EntityCreateDialog
        open={bulk.showCreateDialog}
        onOpenChange={(open) => {
          bulk.setShowCreateDialog(open);
          if (!open) bulk.setSelectedTransaction(null);
        }}
        onEntityCreated={bulk.handleEntityCreated}
        suggestedName={bulk.selectedTransaction?.entity?.entityName}
        dbEntities={bulk.dbEntities}
      />
    </>
  );
}
