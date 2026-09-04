import { commitResult, type CommitResultFixture } from '@/fixtures/import-transactions';
import { AlertCircle, CheckCircle, List, Plus, RefreshCw, XCircle } from 'lucide-react';

import { Button, EmptyState, SummaryCard } from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Summary', order: 9, frame: 'web' };

function totalRulesApplied(result: CommitResultFixture): number {
  return (
    result.rulesApplied.add +
    result.rulesApplied.edit +
    result.rulesApplied.disable +
    result.rulesApplied.remove +
    result.tagRulesApplied
  );
}

function SummaryCards({ result, totalRules }: { result: CommitResultFixture; totalRules: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <SummaryCard
        icon={<CheckCircle className="h-5 w-5 text-success" aria-hidden />}
        value={result.entitiesCreated}
        label="Entities Created"
        variant="success"
      />
      <SummaryCard
        icon={<CheckCircle className="h-5 w-5 text-info" aria-hidden />}
        value={totalRules}
        label="Rules Applied"
        variant="info"
      />
      <SummaryCard
        icon={<CheckCircle className="h-5 w-5 text-success" aria-hidden />}
        value={result.transactionsImported}
        label="Transactions Imported"
        variant="success"
      />
      {result.transactionsFailed > 0 ? (
        <SummaryCard
          icon={<XCircle className="h-5 w-5 text-destructive" aria-hidden />}
          value={result.transactionsFailed}
          label="Transactions Failed"
          variant="destructive"
        />
      ) : (
        <SummaryCard
          icon={<AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden />}
          value={0}
          label="Transactions Failed"
          variant="neutral"
        />
      )}
    </div>
  );
}

type FailedDetails = NonNullable<CommitResultFixture['failedDetails']>;

function FailedDetailsList({ details }: { details: FailedDetails }) {
  if (details.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        <XCircle className="h-4 w-4 text-destructive" aria-hidden />
        <h3 className="text-sm font-semibold text-destructive">Failed Transactions</h3>
      </div>
      <div className="space-y-2">
        {details.map((detail) => (
          <div
            key={detail.checksum ?? detail.error}
            className="flex items-start gap-3 border-b border-destructive/10 py-1 text-sm last:border-0"
          >
            {detail.checksum && (
              <span className="shrink-0 font-mono text-xs text-destructive">
                {detail.checksum.slice(0, 12)}
              </span>
            )}
            <span className="text-xs text-destructive">{detail.error}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type RulesApplied = CommitResultFixture['rulesApplied'];

function RuleBreakdown({
  rulesApplied,
  totalRules,
}: {
  rulesApplied: RulesApplied;
  totalRules: number;
}) {
  if (totalRules === 0) return null;
  const items: Array<[number, string]> = [
    [rulesApplied.add, 'Added'],
    [rulesApplied.edit, 'Edited'],
    [rulesApplied.disable, 'Disabled'],
    [rulesApplied.remove, 'Removed'],
  ];
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-semibold">Rule Breakdown</h3>
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        {items.map(([count, label]) =>
          count > 0 ? (
            <div key={label}>
              <div className="font-medium">{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function RetroactiveSection({ count }: { count: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">Retroactive Reclassifications</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {count > 0
          ? `${count} existing transaction${count === 1 ? ' was' : 's were'} reclassified based on updated rules.`
          : 'No existing transactions affected.'}
      </p>
    </div>
  );
}

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
      <RuleBreakdown rulesApplied={result.rulesApplied} totalRules={totalRules} />
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
  'no-commit-result': () => (
    <div className="mx-auto max-w-2xl p-6">
      <EmptyState
        title="No commit results available."
        description="Complete the final review and commit before viewing the summary."
      />
    </div>
  ),
};
