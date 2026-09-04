import {
  confirmedTxns,
  droppedRows,
  importTxns,
  ruleProposals,
} from '@/fixtures/import-transactions';
import {
  ClassificationRulesSection,
  EntitiesSection,
  isEmptySummary,
  type PendingSummary,
  TagAssignmentsSection,
  TagRulesSection,
  totalOpsOf,
  TransactionsSection,
} from '@/kit/import-commit-sections';
import { AlertCircle, Loader2 } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  PageHeader,
} from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Commit', order: 8, frame: 'web' };

type ConfirmDialogProps = { open: boolean; committing: boolean; summary: PendingSummary };

function ConfirmDialog({ open, committing, summary }: ConfirmDialogProps) {
  const entityCount = summary.entities.length;
  const ruleCount = totalOpsOf(summary.rulesApplied) + summary.tagRules.length;
  const txnCount = summary.txnBreakdown.imported;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Commit this import?</AlertDialogTitle>
          <AlertDialogDescription>
            This will create {entityCount} {entityCount === 1 ? 'entity' : 'entities'}, apply{' '}
            {ruleCount} classification {ruleCount === 1 ? 'rule change' : 'rule changes'}, and
            import {txnCount} {txnCount === 1 ? 'transaction' : 'transactions'}. This cannot be
            undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={committing}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={committing}>
            {committing ? 'Committing...' : 'Approve & Commit All'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface StepProps {
  choice: ImportChoice;
  summary: PendingSummary;
  confirmOpen?: boolean;
  committing?: boolean;
  error?: string;
}

function Step({ choice, summary, confirmOpen = false, committing = false, error }: StepProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader
        title="Final Review"
        description="Review all pending changes before committing. Navigate back to make edits."
      />
      <ImportContextStrip choice={choice} editable={false} />
      <div className="space-y-4">
        <EntitiesSection entities={summary.entities} />
        <ClassificationRulesSection rulesApplied={summary.rulesApplied} />
        <TagRulesSection proposals={summary.tagRules} />
        <TransactionsSection breakdown={summary.txnBreakdown} accountName={choice.account.name} />
        <TagAssignmentsSection {...summary.tagAssignment} />
        {isEmptySummary(summary) && (
          <p className="py-6 text-sm text-muted-foreground">No pending changes to review.</p>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Commit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-between pt-4">
        <Button variant="outline" disabled={committing}>
          Back
        </Button>
        <Button disabled={committing}>
          {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {committing ? 'Committing...' : 'Approve & Commit All'}
        </Button>
      </div>
      <ConfirmDialog open={confirmOpen} committing={committing} summary={summary} />
    </div>
  );
}

const AMEX = choiceOf('a2', 'amex-csv');

const DROPPED = droppedRows(importTxns).length;
const DUPES = importTxns.filter((t) => t.bucket === 'skipped').length;
const TAGGED = confirmedTxns.filter((t) => t.suggestedTags.length > 0).length;

const PENDING: PendingSummary = {
  entities: ['The Grounds of Alexandria', 'Amazon'],
  rulesApplied: { add: 2, edit: 1, disable: 0, remove: 0 },
  tagRules: ruleProposals,
  txnBreakdown: { imported: confirmedTxns.length - DROPPED, duplicates: DUPES, dropped: DROPPED },
  tagAssignment: { tagged: TAGGED, total: confirmedTxns.length },
};

const NOTHING_PENDING: PendingSummary = {
  entities: [],
  rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
  tagRules: [],
  txnBreakdown: { imported: 0, duplicates: 0, dropped: 0 },
  tagAssignment: { tagged: 0, total: 0 },
};

export default function ImportCommitStep() {
  return <Step choice={AMEX} summary={PENDING} />;
}

export const states: ScreenStates = {
  'nothing-pending': () => <Step choice={AMEX} summary={NOTHING_PENDING} />,
  'confirm-dialog-open': () => <Step choice={AMEX} summary={PENDING} confirmOpen />,
  committing: () => <Step choice={AMEX} summary={PENDING} committing />,
  'commit-failed': () => <Step choice={AMEX} summary={PENDING} error="Network request failed." />,
};
