import { AlertCircle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';

import { SummaryCard } from '@pops/ui';

import type { CommitResultFixture } from '@/fixtures/import-transactions';

/** Presentational sections for the import wizard's Summary step. */

export function totalRulesApplied(result: CommitResultFixture): number {
  const { add, edit, disable, remove } = result.rulesApplied;
  return add + edit + disable + remove + result.tagRulesApplied;
}

export function SummaryCards({
  result,
  totalRules,
}: {
  result: CommitResultFixture;
  totalRules: number;
}) {
  const failed = result.transactionsFailed > 0;
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
      <SummaryCard
        icon={
          failed ? (
            <XCircle className="h-5 w-5 text-destructive" aria-hidden />
          ) : (
            <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
          )
        }
        value={result.transactionsFailed}
        label="Transactions Failed"
        variant={failed ? 'destructive' : 'neutral'}
      />
    </div>
  );
}

type FailedDetails = NonNullable<CommitResultFixture['failedDetails']>;

export function FailedDetailsList({ details }: { details: FailedDetails }) {
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

export function RuleBreakdown({
  rulesApplied,
  tagRulesApplied,
  totalRules,
}: {
  rulesApplied: RulesApplied;
  tagRulesApplied: number;
  totalRules: number;
}) {
  if (totalRules === 0) return null;
  const items: Array<[number, string]> = [
    [rulesApplied.add, 'Added'],
    [rulesApplied.edit, 'Edited'],
    [rulesApplied.disable, 'Disabled'],
    [rulesApplied.remove, 'Removed'],
    [tagRulesApplied, 'Tag rules'],
  ];
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-semibold">Rule Breakdown</h3>
      <div className="grid grid-cols-5 gap-2 text-center text-sm">
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

export function RetroactiveSection({ count }: { count: number }) {
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
