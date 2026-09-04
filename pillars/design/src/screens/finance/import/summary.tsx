import { commitResult, type CommitResultFixture } from '@/fixtures/import-transactions';
import {
  FailedDetailsList,
  RetroactiveSection,
  RuleBreakdown,
  SummaryCards,
  totalRulesApplied,
} from '@/kit/import-summary-sections';
import { CheckCircle, List, Plus } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Summary', order: 9, frame: 'web' };

function FooterActions() {
  return (
    <div className="flex justify-between gap-3">
      <Button variant="outline">
        <Plus className="h-4 w-4" aria-hidden />
        New Import
      </Button>
      <Button>
        <List className="h-4 w-4" aria-hidden />
        View Transactions
      </Button>
    </div>
  );
}

function Step({ choice, result }: { choice: ImportChoice; result: CommitResultFixture }) {
  const totalRules = totalRulesApplied(result);
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <ImportContextStrip choice={choice} editable={false} />
      <div className="text-center">
        <CheckCircle className="mx-auto mb-4 h-16 w-16 text-success" aria-hidden />
        <h2 className="mb-2 text-2xl font-semibold">Import Complete</h2>
        <p className="text-sm text-muted-foreground">
          All changes have been committed successfully.
        </p>
      </div>
      <SummaryCards result={result} totalRules={totalRules} />
      {result.failedDetails && <FailedDetailsList details={result.failedDetails} />}
      <RuleBreakdown
        rulesApplied={result.rulesApplied}
        tagRulesApplied={result.tagRulesApplied}
        totalRules={totalRules}
      />
      <RetroactiveSection count={result.retroactiveReclassifications} />
      <FooterActions />
    </div>
  );
}

const AMEX = choiceOf('a2', 'amex-csv');

export default function ImportSummaryStep() {
  return <Step choice={AMEX} result={commitResult} />;
}

export const states: ScreenStates = {
  'no-failures': () => (
    <Step
      choice={AMEX}
      result={{ ...commitResult, transactionsFailed: 0, failedDetails: undefined }}
    />
  ),
  'no-rules-applied': () => (
    <Step
      choice={AMEX}
      result={{
        ...commitResult,
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
        tagRulesApplied: 0,
      }}
    />
  ),
  'only-tag-rules-applied': () => (
    <Step
      choice={AMEX}
      result={{
        ...commitResult,
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
        tagRulesApplied: 2,
      }}
    />
  ),
  'no-commit-result': () => (
    <div className="mx-auto max-w-2xl p-6">
      <EmptyState
        title="No commit results available."
        description="Complete the final review and commit before viewing the summary."
      />
    </div>
  ),
};
