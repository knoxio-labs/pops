import { byBucket, droppedRows, importTxns, type ImportTxn } from '@/fixtures/import-transactions';
import { DroppedRowsNotice } from '@/kit/import-dropped-rows-notice';
import { ImportReviewContext } from '@/kit/import-review-context';
import { ImportTakenOverNotice } from '@/kit/import-taken-over-notice';
import { TxnCardList } from '@/kit/import-txn-card';
import { SkippedTxnTable } from '@/kit/import-txn-skipped-table';
import { AlertCircle, AlertTriangle, CheckCircle, Settings2, XCircle } from 'lucide-react';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Review', order: 5, frame: 'web' };

const AMEX = choiceOf('a2', 'amex-csv');
const UP_LIVE = choiceOf('a13', 'up-live');

interface ReviewBuckets {
  matched: ImportTxn[];
  uncertain: ImportTxn[];
  failed: ImportTxn[];
  skipped: ImportTxn[];
}

function bucketsOf(txns: ImportTxn[]): ReviewBuckets {
  return {
    matched: txns.filter((t) => t.bucket === 'matched'),
    uncertain: txns.filter((t) => t.bucket === 'uncertain'),
    failed: txns.filter((t) => t.bucket === 'failed'),
    skipped: txns.filter((t) => t.bucket === 'skipped'),
  };
}

function ReviewHeader({ unresolvedCount }: { unresolvedCount: number }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Review</h2>
        <p className="text-sm text-muted-foreground">
          {unresolvedCount > 0
            ? `${unresolvedCount} transaction(s) need your attention`
            : 'All transactions are ready to import'}
        </p>
      </div>
      <Button variant="outline" size="sm">
        <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
        Manage Rules
      </Button>
    </div>
  );
}

function ReviewFooter({
  unresolvedCount,
  committedCount,
}: {
  unresolvedCount: number;
  committedCount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline">Back</Button>
      <div className="flex flex-col items-end gap-1">
        {unresolvedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Resolve all uncertain/failed transactions to continue
          </p>
        )}
        <Button
          disabled={unresolvedCount > 0}
        >{`Continue to Tag Review (${committedCount})`}</Button>
      </div>
    </div>
  );
}

function ReviewTabs({ buckets }: { buckets: ReviewBuckets }) {
  return (
    <>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="matched" className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4" aria-hidden />
          <span>Matched ({buckets.matched.length})</span>
        </TabsTrigger>
        <TabsTrigger value="uncertain" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>Uncertain ({buckets.uncertain.length})</span>
        </TabsTrigger>
        <TabsTrigger value="failed" className="flex items-center gap-2">
          <XCircle className="h-4 w-4" aria-hidden />
          <span>Failed ({buckets.failed.length})</span>
        </TabsTrigger>
        <TabsTrigger value="skipped" className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <span>Skipped ({buckets.skipped.length})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="matched" className="mt-4">
        <TxnCardList txns={buckets.matched} emptyMessage="No matched transactions" />
      </TabsContent>
      <TabsContent value="uncertain" className="mt-4">
        <TxnCardList txns={buckets.uncertain} emptyMessage="No uncertain transactions" />
      </TabsContent>
      <TabsContent value="failed" className="mt-4">
        <TxnCardList txns={buckets.failed} emptyMessage="No failed transactions" />
      </TabsContent>
      <TabsContent value="skipped" className="mt-4">
        <SkippedTxnTable txns={buckets.skipped} />
      </TabsContent>
    </>
  );
}

function Step({
  txns,
  activeTab = 'uncertain',
  choice = AMEX,
  liveArrivals,
  takenOverAt,
}: {
  txns: ImportTxn[];
  activeTab?: string;
  choice?: ImportChoice;
  liveArrivals?: number;
  takenOverAt?: string;
}) {
  const buckets = bucketsOf(txns);
  const unresolvedCount = buckets.uncertain.length + buckets.failed.length;
  const dropped = droppedRows(txns);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <ImportReviewContext choice={choice} liveArrivals={liveArrivals} />
      <ReviewHeader unresolvedCount={unresolvedCount} />
      <DroppedRowsNotice dropped={dropped} />
      <Tabs defaultValue={activeTab} className="w-full">
        <ReviewTabs buckets={buckets} />
      </Tabs>
      <ReviewFooter unresolvedCount={unresolvedCount} committedCount={buckets.matched.length} />
      {takenOverAt && <ImportTakenOverNotice takenAt={takenOverAt} />}
    </div>
  );
}

/**
 * The review step of the import wizard: matched/uncertain/failed/skipped
 * tabs of transaction cards, the dropped-rows warning, and the Continue gate
 * that stays disabled until every uncertain/failed row is resolved. Ported
 * from `pillars/finance/app/src/components/imports/ReviewStep.tsx` and its
 * `review/` subcomponents, on the `importTxns` fixture.
 */
export default function ImportReviewStep() {
  return <Step txns={importTxns} />;
}

export const states: ScreenStates = {
  'all-resolved': () => (
    <Step txns={[...byBucket('matched'), ...byBucket('skipped')]} activeTab="matched" />
  ),
  unresolved: () => <Step txns={importTxns} activeTab="uncertain" />,
  'with-dropped-rows': () => <Step txns={importTxns} activeTab="matched" />,
  empty: () => <Step txns={[]} activeTab="matched" />,
  'taken-over-elsewhere': () => (
    <Step txns={importTxns} activeTab="uncertain" takenOverAt="2026-09-06T09:41:00+10:00" />
  ),
  'live-arrivals-held-back': () => (
    <Step txns={importTxns} activeTab="uncertain" choice={UP_LIVE} liveArrivals={4} />
  ),
};
