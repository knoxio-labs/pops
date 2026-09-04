import { byBucket, droppedRows, importTxns, type ImportTxn } from '@/fixtures/import-transactions';
import { TxnCardList } from '@/kit/import-txn-card';
import { SkippedTxnTable } from '@/kit/import-txn-skipped-table';
import { AlertCircle, AlertTriangle, CheckCircle, Settings2, XCircle } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pops/ui';

import { choiceOf } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Review', order: 5, frame: 'web' };

const AMEX = choiceOf('a2', 'amex-csv');

/** What each dropped row is missing, mirroring `DroppedRowsNotice`'s `remedies`. */
function dropReason(txn: ImportTxn): 'entity' | 'type' {
  return txn.amount > 0 ? 'type' : 'entity';
}

function remedies(dropped: ImportTxn[]): string[] {
  const reasons = new Set(dropped.map(dropReason));
  const lines: string[] = [];
  if (reasons.has('entity')) {
    lines.push('assign a merchant entity, or change the type to a non-merchant one');
  }
  if (reasons.has('type')) {
    lines.push(
      'set a transaction type on the money coming in — a credit is never assumed to be an expense'
    );
  }
  return lines;
}

/**
 * Ported from `pillars/finance/app/src/components/imports/review/DroppedRowsNotice.tsx`:
 * a non-blocking warning that some matched rows won't be imported because they
 * are missing an entity or a transaction type on a credit.
 */
function DroppedRowsNotice({ dropped }: { dropped: ImportTxn[] }) {
  const count = dropped.length;
  if (count <= 0) return null;
  return (
    <Alert className="border-warning/25 bg-warning/10 text-warning">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>
        {count} matched transaction{count !== 1 ? 's' : ''} won&apos;t be imported
      </AlertTitle>
      <AlertDescription>
        <ul className="list-inside list-disc text-xs">
          {remedies(dropped).map((line) => (
            <li key={line}>In the Matched tab, {line}.</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

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

function Step({ txns, activeTab = 'uncertain' }: { txns: ImportTxn[]; activeTab?: string }) {
  const buckets = bucketsOf(txns);
  const unresolvedCount = buckets.uncertain.length + buckets.failed.length;
  const dropped = droppedRows(txns);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <ImportContextStrip choice={AMEX} />
      <ReviewHeader unresolvedCount={unresolvedCount} />
      <DroppedRowsNotice dropped={dropped} />
      <Tabs defaultValue={activeTab} className="w-full">
        <ReviewTabs buckets={buckets} />
      </Tabs>
      <ReviewFooter unresolvedCount={unresolvedCount} committedCount={buckets.matched.length} />
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
};
