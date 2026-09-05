import {
  type CorrectionSignal,
  type PreviewTransactionEntry,
  type ServerChangeSet,
  type TriggeringTransactionContext,
} from './correction-proposal-shared';
import { CorrectionProposalWorkflow } from './correction-proposal/CorrectionProposalWorkflow';
import { CorrectionRuleManagerDialog } from './correction-proposal/CorrectionRuleManagerDialog';

// Re-export shared symbols so existing consumers don't break
export type {
  AddRuleData,
  CorrectionSignal,
  EditRuleData,
  LocalOp,
  OpKind,
  PreviewChangeSetOutput,
  PreviewTransactionEntry,
  TriggeringTransactionContext,
} from './correction-proposal-shared';
export {
  matchTypeLabel,
  normalizeDescription,
  opKindBadgeVariant,
  opKindLabel,
  opSummary,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
  transactionMatchesSignal,
} from './correction-proposal-shared';

// Re-export hook helpers for tests
export { serverOpToLocalOp } from './hooks/useLocalOps';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CorrectionProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  triggeringTransaction: TriggeringTransactionContext | null;
  previewTransactions: PreviewTransactionEntry[];
  minConfidence?: number;
  /** True while the proposal signal is still being generated (analysis in flight). */
  generating?: boolean;
  /** The AI's reported confidence (0.0-1.0) in `signal`'s pattern, when AI-derived (CF038/#3655). */
  patternConfidence?: number | null;
  onApproved?: (changeSet: ServerChangeSet) => void;
  mode?: 'proposal' | 'browse';
  onBrowseClose?: (hadChanges: boolean) => void;
}

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const minConfidence = props.minConfidence ?? 0.7;
  if (props.mode === 'browse') {
    return (
      <CorrectionRuleManagerDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        onBrowseClose={props.onBrowseClose}
        minConfidence={minConfidence}
        previewTransactions={props.previewTransactions}
      />
    );
  }

  return (
    <CorrectionProposalWorkflow
      open={props.open}
      onOpenChange={props.onOpenChange}
      sessionId={props.sessionId}
      signal={props.signal}
      triggeringTransaction={props.triggeringTransaction}
      previewTransactions={props.previewTransactions}
      minConfidence={minConfidence}
      generating={props.generating}
      patternConfidence={props.patternConfidence}
      onApproved={props.onApproved}
    />
  );
}
