import { LoaderCircle } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { SpendingNotice } from './spending-notice';
import { SpendingRecordRows } from './spending-records';

import type { CraftFinanceIntent, CraftSpendingState } from '@/fixtures/trip-timeline-craft-types';

/** Shows creation and recovery states while leaving transaction ownership with Finance. */
export function SpendingRecoveryContent({
  state,
  onIntent,
}: {
  state: Extract<
    CraftSpendingState,
    { kind: 'creating' | 'attachment-failed' | 'uncertain-create' | 'choose-existing' | 'linked' }
  >;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  switch (state.kind) {
    case 'creating':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Finance is saving the transaction
        </p>
      );
    case 'attachment-failed':
      return <LinkRetry state={state} onIntent={onIntent} />;
    case 'uncertain-create':
      return (
        <div className="space-y-3">
          <SpendingNotice
            title="Finance has not confirmed the transaction"
            description="Check existing transactions before starting another create. Similar details do not confirm that this transaction was saved."
          />
          <Button onClick={() => onIntent({ kind: 'find-existing-transaction' })}>
            Find existing transaction
          </Button>
        </div>
      );
    case 'choose-existing':
      return <ChooseExisting state={state} onIntent={onIntent} />;
    case 'linked':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">The original record remains in Finance.</p>
            <Badge variant="secondary">Linked to trip</Badge>
          </div>
          <SpendingRecordRows
            records={[state.transaction]}
            onOpen={(transactionId) => onIntent({ kind: 'open-transaction', transactionId })}
          />
          <Button variant="outline" onClick={() => onIntent({ kind: 'open-manual-entry' })}>
            Add another transaction
          </Button>
        </div>
      );
  }
}

function LinkRetry({
  state,
  onIntent,
}: {
  state: Extract<CraftSpendingState, { kind: 'attachment-failed' }>;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  return (
    <div className="space-y-3">
      <SpendingNotice
        title="Saved in Finance; trip link needs another try"
        description="Retry the link for this same transaction. The transaction itself will not be created again."
      />
      <SpendingRecordRows
        records={[state.transaction]}
        onOpen={(transactionId) => onIntent({ kind: 'open-transaction', transactionId })}
      />
      <Button
        onClick={() => onIntent({ kind: 'retry-trip-link', transactionId: state.transaction.id })}
      >
        Retry trip link
      </Button>
    </div>
  );
}

function ChooseExisting({
  state,
  onIntent,
}: {
  state: Extract<CraftSpendingState, { kind: 'choose-existing' }>;
  onIntent: (intent: CraftFinanceIntent) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select the exact Finance record to link. Similar merchant or amount details are not
        confirmation.
      </p>
      <SpendingRecordRows
        records={state.records}
        onOpen={(transactionId) => onIntent({ kind: 'open-transaction', transactionId })}
        onLink={(transactionId) => onIntent({ kind: 'link-existing-transaction', transactionId })}
      />
    </div>
  );
}
