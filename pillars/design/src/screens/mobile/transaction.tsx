import { transactionDetail } from '@/fixtures/transactions';
import { PopsCard } from '@/frames/ios/primitives';
import { EmptyStateView, ErrorStateView, LoadingStateView } from '@/frames/ios/state-views';
import { FailureBanner } from '@/kit/ios-transaction-list-parts';
import {
  amountColour,
  amountText,
  detailFields,
  transactionDate,
  FAILURE_MESSAGE,
} from '@/kit/ios-transaction-presentation';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Transaction, TransactionDetail } from '@/fixtures/transactions';

export const meta: ScreenMeta = { title: 'Transaction', order: 6, frame: 'ios' };

const seed = transactionDetail;

function Heading({ transaction }: { transaction: Transaction }) {
  return (
    <PopsCard>
      <div className="space-y-2">
        <h1 className="ios-title">{transaction.description}</h1>
        <p className="ios-monospaced" style={{ color: amountColour(transaction) }}>
          {amountText(transaction)}
        </p>
        <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
          {transactionDate(transaction.date)}
        </p>
      </div>
    </PopsCard>
  );
}

/**
 * One transaction. The screen opens on what the tapped row already had —
 * type, entity, tags — and the fuller record appends beneath it, so nothing
 * a reader is looking at moves when the fetch lands. That is why the shared
 * three are pinned to the top of the field list rather than sorted with the
 * rest.
 *
 * A field with no value is absent, never a dash: an empty row reads as a
 * value that is blank, when what is true is that the server sent none.
 */
export function TransactionPage({
  transaction,
  detail,
  failure,
}: {
  transaction: Transaction;
  detail?: TransactionDetail;
  failure?: string;
}) {
  const fields = detailFields(transaction, detail);
  return (
    <div className="space-y-4 p-4">
      {failure === undefined ? null : (
        <FailureBanner lead="Could not load the full record." message={failure} />
      )}
      <Heading transaction={transaction} />
      {fields.length === 0 ? null : (
        <PopsCard>
          <dl className="space-y-3">
            {fields.map((field) => (
              <div key={field.label} className="space-y-0.5">
                <dt className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
                  {field.label}
                </dt>
                <dd className="ios-body">{field.value}</dd>
              </div>
            ))}
          </dl>
        </PopsCard>
      )}
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <LoadingStateView message="Loading transaction…" />,
  seeded: () => <TransactionPage transaction={seed} />,
  'not-found': () => <EmptyStateView message="This transaction no longer exists." />,
  error: () => <ErrorStateView message={FAILURE_MESSAGE.unauthorized} />,
  'fetch-failed': () => <TransactionPage transaction={seed} failure={FAILURE_MESSAGE.transport} />,
};

export default function TransactionScreen() {
  return <TransactionPage transaction={seed} detail={transactionDetail} />;
}
