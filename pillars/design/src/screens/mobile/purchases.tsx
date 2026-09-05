import { formatBalance } from '@/fixtures/currencies';
import { purchases } from '@/fixtures/purchases';
import { PopsRow } from '@/frames/ios/primitives';
import { EmptyStateView, ErrorStateView, LoadingStateView } from '@/frames/ios/state-views';
import { IosHairline } from '@/kit/ios-controls';
import { transactionDate } from '@/kit/ios-transaction-presentation';
import { Fragment } from 'react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Purchase } from '@/fixtures/purchases';

export const meta: ScreenMeta = { title: 'Purchases', order: 7, frame: 'ios' };

const FAILURE = 'Your purchases are temporarily unreachable. Try again in a moment.';

/**
 * A purchase always cost something, so its total is never signed and never
 * tinted: this list has no credits in it, and drawing the amount in anything
 * but the plain foreground would invent a distinction the data does not make.
 */
function Row({ purchase }: { purchase: Purchase }) {
  return (
    <div className="min-h-11 py-1">
      <PopsRow
        title={purchase.merchantName ?? 'Unknown merchant'}
        subtitle={transactionDate(purchase.orderedOn)}
        trailing={
          <span className="ios-monospaced shrink-0">
            {formatBalance(purchase.totalMinorUnits, purchase.currency)}
          </span>
        }
      />
    </div>
  );
}

/**
 * What was bought, newest first. The row is deliberately thinner than the
 * transaction row it sits beside in the tab bar: a purchase is one merchant
 * and one number, and the item count and the receipt the record also carries
 * belong to the purchase's own screen rather than to a list being scanned.
 */
export function PurchasesList({ rows }: { rows: Purchase[] }) {
  return (
    <div className="p-4">
      {rows.map((purchase, index) => (
        <Fragment key={purchase.id}>
          {index > 0 ? <IosHairline /> : null}
          <Row purchase={purchase} />
        </Fragment>
      ))}
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <LoadingStateView message="Loading purchases…" />,
  empty: () => <EmptyStateView message="No purchases yet." />,
  error: () => <ErrorStateView message={FAILURE} />,
};

export default function PurchasesScreen() {
  return <PurchasesList rows={purchases} />;
}
