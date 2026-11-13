import { ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import { SpendingNotice } from './spending-notice';
import { SpendingRecordRows } from './spending-records';

import type {
  CraftFinanceIntent,
  CraftSpendingRecord,
  CraftSpendingState,
} from '@/fixtures/trip-timeline-craft-types';

function RecordDisclosure({
  records,
  onOpen,
}: {
  records: readonly CraftSpendingRecord[];
  onOpen: (transactionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="min-h-11 gap-2 px-0">
          {open ? 'Hide transactions' : 'View transactions'}
          <ChevronDown
            className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SpendingRecordRows records={records} onOpen={onOpen} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Shows Finance read results and keeps incomplete-load warnings visible. */
export function SpendingReadContent({
  state,
  onIntent,
}: {
  state: Extract<
    CraftSpendingState,
    { kind: 'tag-missing' | 'loading' | 'unavailable' | 'partial' | 'ready' }
  >;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  switch (state.kind) {
    case 'tag-missing':
      return (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Choose a shared trip tag before showing Finance records here.
          </p>
          <Button variant="outline" onClick={() => onIntent({ kind: 'choose-trip-tag' })}>
            Choose trip tag
          </Button>
        </div>
      );
    case 'loading':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading tagged transactions
        </p>
      );
    case 'unavailable':
      return (
        <div className="space-y-3">
          <SpendingNotice
            title="Spending could not load"
            description="Finance did not return a complete list. No total is shown."
          />
          <Button variant="outline" onClick={() => onIntent({ kind: 'refresh-spending' })}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
        </div>
      );
    case 'partial':
      return <PartialSpending state={state} onIntent={onIntent} />;
    case 'ready':
      return <ReadySpending state={state} onIntent={onIntent} />;
  }
}

function ReadySpending({
  state,
  onIntent,
}: {
  state: Extract<CraftSpendingState, { kind: 'ready' }>;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {state.records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Finance transactions carry this trip’s shared tag yet.
        </p>
      ) : (
        <RecordDisclosure
          records={state.records}
          onOpen={(transactionId) => onIntent({ kind: 'open-transaction', transactionId })}
        />
      )}
      <Button onClick={() => onIntent({ kind: 'open-manual-entry' })}>
        Add transaction in Finance
      </Button>
    </div>
  );
}

function PartialSpending({
  state,
  onIntent,
}: {
  state: Extract<CraftSpendingState, { kind: 'partial' }>;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  return (
    <div className="space-y-2">
      <SpendingNotice
        title="Some transactions are missing from this view"
        description="These are the records loaded so far. No complete count or total is available."
      />
      {state.records.length > 0 && (
        <RecordDisclosure
          records={state.records}
          onOpen={(transactionId) => onIntent({ kind: 'open-transaction', transactionId })}
        />
      )}
      <Button variant="outline" onClick={() => onIntent({ kind: 'refresh-spending' })}>
        <RefreshCw className="size-4" aria-hidden />
        Reload spending
      </Button>
    </div>
  );
}
