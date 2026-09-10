import { PURCHASE_STATUS_LABELS } from '@/kit/purchases/labels';
import { useId, useState } from 'react';

import { Badge, Button, formatCents, formatDate } from '@pops/ui';

import { ATTRIBUTION_BADGE_LABEL } from './attribution-legend';
import { explainedSplit } from './explained-split';
import { ExplainedSplitView } from './explained-split-view';
import { merchantLabel } from './merchant-label';
import { orderCountAgreement, orderCountLabel } from './order-count-agreement';

import type { MerchantOrder } from '@/fixtures/purchases-merchant-orders';
import type { MerchantSpend } from '@/fixtures/purchases-merchant-spend';

import type { OrderCountAgreement } from './order-count-agreement';

/**
 * The order index caps a page at 500, and a row is opened to be read rather
 * than paged, so the drill-down asks for the whole cap in one go and reports
 * what it could not fit rather than offering a second page.
 */
const ORDERS_LIMIT = 500;

/**
 * How the merchant's own orders came back. A drill-down that is still loading
 * or that failed says so: the row already counted orders here, so an empty
 * list would be a claim about the data rather than about the read.
 */
export type DrillDownState = 'ready' | 'loading' | 'failed';

/** One merchant, one currency: the headline, the split, the figures it is made of, and its orders. */
export function MerchantRow({
  merchant,
  orders,
  initiallyOpen = false,
  drillDown = 'ready',
}: {
  merchant: MerchantSpend;
  orders: MerchantOrder[];
  /** Opens the drill-down on first render, so a states view can show it. */
  initiallyOpen?: boolean;
  drillDown?: DrillDownState;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const regionId = useId();
  const { accounting, currency } = merchant;
  const label = merchantLabel(merchant.merchant);

  return (
    <article className="space-y-2 rounded-md border p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium">{label}</h3>
          <Badge variant="outline">{ATTRIBUTION_BADGE_LABEL[merchant.merchant.resolution]}</Badge>
          <span className="text-muted-foreground text-xs">
            {orderCountLabel(merchant.orderCount)}
          </span>
        </div>
        <p className="text-lg font-semibold tabular-nums">
          {formatCents(accounting.totalCents, currency)}
        </p>
      </header>

      <ExplainedSplitView split={explainedSplit(accounting)} currency={currency} />

      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Figure label="Matched" value={formatCents(accounting.matchedCents, currency)} />
        <Figure
          label="Awaiting import"
          value={formatCents(accounting.awaitingImportCents, currency)}
        />
        <Figure label="Refunded" value={formatCents(accounting.refundedCents, currency)} />
        <Figure label="Net spend" value={formatCents(accounting.netSpendCents, currency)} />
      </dl>

      <Button
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {open ? `Hide the orders behind ${label}` : `Show the orders behind ${label}`}
      </Button>

      {open && (
        <MerchantOrders
          merchant={merchant}
          orders={orders}
          regionId={regionId}
          label={label}
          state={drillDown}
        />
      )}
    </article>
  );
}

function MerchantOrders({
  merchant,
  orders,
  regionId,
  label,
  state,
}: {
  merchant: MerchantSpend;
  orders: MerchantOrder[];
  regionId: string;
  label: string;
  state: DrillDownState;
}) {
  const agreement = orderCountAgreement(orders.length, merchant.orderCount, ORDERS_LIMIT);

  if (state === 'loading') {
    return (
      <p id={regionId} role="status" className="text-muted-foreground text-xs">
        Loading this merchant&rsquo;s orders…
      </p>
    );
  }

  if (state === 'failed') {
    return (
      <div id={regionId} role="alert" className="space-y-2">
        <p className="text-xs font-medium">Could not load this merchant&rsquo;s orders</p>
        <p className="text-muted-foreground text-xs">
          The order index did not answer. The figures above still stand.
        </p>
        <Button size="sm" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div id={regionId} className="space-y-2">
      {orders.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label={`Orders paid to ${label}`}>
          {orders.map((order) => (
            <li key={order.id}>
              <OrderRow order={order} />
            </li>
          ))}
        </ul>
      )}
      <Disagreement agreement={agreement} shown={orders.length} counted={merchant.orderCount} />
    </div>
  );
}

/**
 * What the list and the row's count say about each other, when they say
 * different things. Every case here is a row the roll-up counted orders on,
 * so none of these are ordinary empty or partial states.
 */
function Disagreement({
  agreement,
  shown,
  counted,
}: {
  agreement: OrderCountAgreement;
  shown: number;
  counted: number;
}) {
  if (agreement === 'agrees') return null;
  return <p className="text-warning text-xs">{disagreementText(agreement, shown, counted)}</p>;
}

function disagreementText(agreement: OrderCountAgreement, shown: number, counted: number): string {
  switch (agreement) {
    case 'none':
      return `The roll-up counted ${orderCountLabel(counted)} here, and the order index returned none. The two reads disagree: do not read either as complete.`;
    case 'capped':
      return `Showing the first ${shown} of the ${counted} orders in this total. The list is at the page limit, so the rest are past it and the list above is not the whole of the figures above it.`;
    case 'short':
      return `Showing ${shown} orders, and the roll-up counted ${counted}. The list is not at the page limit, so the two reads disagree: do not read either as complete.`;
    case 'over':
      return `Showing ${shown} orders, and the roll-up counted ${counted}. The list holds more orders than the figures above were computed from: do not read either as complete.`;
    case 'agrees':
      return '';
  }
}

function OrderRow({ order }: { order: MerchantOrder }) {
  return (
    <a
      href={`#/purchases/${order.id}`}
      className="hover:bg-muted/50 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span>{formatDate(order.orderedAt)}</span>
        <span className="text-muted-foreground text-xs">
          {order.sourceOrderId ?? 'No order reference'}
        </span>
        <span className="text-muted-foreground text-xs">
          {PURCHASE_STATUS_LABELS[order.status]}
        </span>
      </span>
      <span className="text-sm font-medium tabular-nums">
        {formatCents(order.totalCents, order.currency)}
      </span>
    </a>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt>{label}</dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
