import { Fact } from '@/kit/purchases/fact';

import { formatDate } from '@pops/ui';

import { INGEST_METHOD_LABELS, PURCHASE_STATUS_LABELS, SETTLEMENT_MODE_LABELS } from './labels';

import type { OrderPurchase } from '@/fixtures/purchases-order-types';

const NOT_RECORDED = 'Not recorded';

/**
 * Who the order was with, when, and how it reached the pillar.
 *
 * The merchant entity id is shown beside its label rather than instead of
 * it: the label is text the merchant wrote, the id is an identity the fleet
 * can resolve, and collapsing them would let a label be read as an identity.
 */
export function OrderIdentity({ purchase }: { purchase: OrderPurchase }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Fact
        label="Ordered"
        value={purchase.orderedAt === null ? null : formatDate(purchase.orderedAt)}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Status"
        value={PURCHASE_STATUS_LABELS[purchase.status]}
        missingLabel={NOT_RECORDED}
      />
      <Fact label="Source" value={purchase.source} missingLabel={NOT_RECORDED} />
      <Fact label="Order reference" value={purchase.sourceOrderId} missingLabel={NOT_RECORDED} />
      <Fact
        label="Merchant entity"
        value={purchase.merchantEntityId}
        missingLabel="Label only, no entity resolved"
      />
      <Fact
        label="Arrived by"
        value={INGEST_METHOD_LABELS[purchase.ingestMethod]}
        missingLabel={NOT_RECORDED}
      />
      <Fact
        label="Settlement"
        value={SETTLEMENT_MODE_LABELS[purchase.settlementMode]}
        missingLabel={NOT_RECORDED}
      />
      <Fact label="Payment" value={purchase.paymentHint} missingLabel={NOT_RECORDED} />
    </dl>
  );
}
