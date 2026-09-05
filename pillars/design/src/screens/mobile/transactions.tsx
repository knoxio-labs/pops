import { transactions } from '@/fixtures/transactions';
import { PopsCard, PopsRow } from '@/frames/ios/primitives';
import { EmptyStateView, ErrorStateView, LoadingStateView } from '@/frames/ios/state-views';
import { IosHairline } from '@/kit/ios-controls';
import { FailureBanner, PagingFooter } from '@/kit/ios-transaction-list-parts';
import {
  amountColour,
  amountText,
  rowCaption,
  rowSubtitle,
  FAILURE_MESSAGE,
} from '@/kit/ios-transaction-presentation';
import { Fragment } from 'react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Transaction } from '@/fixtures/transactions';
import type { Paging } from '@/kit/ios-transaction-list-parts';

export const meta: ScreenMeta = { title: 'Transactions', order: 5, frame: 'ios' };

function Row({ transaction }: { transaction: Transaction }) {
  return (
    <div className="min-h-11 py-2">
      <PopsRow
        title={transaction.description}
        subtitle={rowSubtitle(transaction)}
        trailing={
          <span className="ios-monospaced shrink-0" style={{ color: amountColour(transaction) }}>
            {amountText(transaction)}
          </span>
        }
      />
      <p className="ios-caption pt-1" style={{ color: 'var(--ios-muted-foreground)' }}>
        {rowCaption(transaction)}
      </p>
    </div>
  );
}

/**
 * The ledger as the phone lists it. Three lines of fact per row — what it
 * was, who it was with and when, and what kind of movement it is — because
 * the app carries the type and the tags on every row and a design that drops
 * them is designing a different screen.
 *
 * Only a credit is tinted. Spending is the ordinary case and takes the plain
 * foreground: the destructive token means "this failed" everywhere else in
 * the app, and a purchase is not a failure.
 */
export function TransactionsList({
  rows,
  paging = 'exhausted',
  refreshFailure,
}: {
  rows: Transaction[];
  paging?: Paging;
  refreshFailure?: string;
}) {
  return (
    <div className="space-y-4 p-4">
      {refreshFailure === undefined ? null : (
        <FailureBanner lead="Could not refresh." message={refreshFailure} />
      )}
      <PopsCard>
        {rows.map((transaction, index) => (
          <Fragment key={transaction.id}>
            {index > 0 ? <IosHairline /> : null}
            <Row transaction={transaction} />
          </Fragment>
        ))}
      </PopsCard>
      <PagingFooter state={paging} />
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <LoadingStateView message="Loading transactions…" />,
  empty: () => <EmptyStateView message="No transactions yet." />,
  error: () => <ErrorStateView message={FAILURE_MESSAGE.unavailable} />,
  'refresh-failed': () => (
    <TransactionsList rows={transactions} refreshFailure={FAILURE_MESSAGE.transport} />
  ),
  'loading-more': () => <TransactionsList rows={transactions} paging="loading" />,
  'paging-failed': () => (
    <TransactionsList rows={transactions} paging={{ failure: FAILURE_MESSAGE.transport }} />
  ),
};

export default function TransactionsScreen() {
  return <TransactionsList rows={transactions} />;
}
