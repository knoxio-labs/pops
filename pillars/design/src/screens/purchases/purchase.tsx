import { HIGHLIGHTED_ITEM_ID, purchaseOrder } from '@/fixtures/purchases-order';
import { minimalPurchaseOrder } from '@/fixtures/purchases-order-minimal';
import { EmptyPanel } from '@/kit/purchases/empty-panel';
import { AccountingSplit } from '@/kit/purchases/purchase-detail/accounting-split';
import { ChargeList } from '@/kit/purchases/purchase-detail/charge-list';
import { DocumentList, ShipmentList } from '@/kit/purchases/purchase-detail/delivery-list';
import { pluralize } from '@/kit/purchases/purchase-detail/format';
import { LineList } from '@/kit/purchases/purchase-detail/line-list';
import { OrderIdentity } from '@/kit/purchases/purchase-detail/order-identity';
import { OrderTags } from '@/kit/purchases/purchase-detail/order-tags';
import { Section } from '@/kit/purchases/purchase-detail/section';
import { RetryableError } from '@/kit/purchases/retryable-error';

import { formatCents, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { PurchaseOrderDetail } from '@/fixtures/purchases-order-types';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Order detail', order: 5, frame: 'web' };

function Page({ children }: { children: ReactNode }) {
  return <div className="space-y-6 p-6">{children}</div>;
}

function BackToQueue() {
  return (
    <a href="#/purchases" className="text-sm underline underline-offset-4">
      Back to the reconcile queue
    </a>
  );
}

/**
 * `/purchases/:purchaseId`, ported into the playground: the destination
 * every other purchases surface (the reconcile queue, a receipt, a global
 * search hit) sends an order id to. A line-item search hit lands here too,
 * at `?item=<id>` — the `item-highlighted` state stands in for that.
 */
function LoadedOrder({
  detail,
  highlightedItemId,
}: {
  detail: PurchaseOrderDetail;
  highlightedItemId: string | null;
}) {
  const { purchase, accounting, items, charges, shipments, documents, tags } = detail;
  const { currency } = purchase;

  return (
    <>
      <PageHeader
        title={purchase.merchantEntityName ?? 'Merchant not named'}
        description={`${formatCents(purchase.totalCents, currency)} · read from ${purchase.source}`}
      />
      <BackToQueue />
      <OrderIdentity purchase={purchase} />
      <Section title="What is accounted for">
        <AccountingSplit accounting={accounting} currency={currency} />
      </Section>
      <Section title={pluralize(items.length, 'line', 'lines')}>
        <LineList lines={items} currency={currency} highlightedItemId={highlightedItemId} />
      </Section>
      <Section title={pluralize(charges.length, 'charge', 'charges')}>
        <ChargeList charges={charges} />
      </Section>
      <Section title={pluralize(shipments.length, 'delivery', 'deliveries')}>
        <ShipmentList shipments={shipments} currency={currency} />
      </Section>
      <Section title={pluralize(documents.length, 'document', 'documents')}>
        <DocumentList documents={documents} />
      </Section>
      <Section title="Tags across this order">
        <OrderTags tags={tags} />
      </Section>
    </>
  );
}

function LoadingState() {
  return (
    <Page>
      <p role="status" className="text-sm text-muted-foreground">
        Loading the order…
      </p>
    </Page>
  );
}

/**
 * A 404 is not a failure — the request worked and the order is gone. No
 * retry is offered, unlike the `error` state below, because retrying an
 * answer that already arrived invites a question that has already been
 * answered.
 */
function AbsentState() {
  return (
    <Page>
      <EmptyPanel
        title="No such order"
        hint="Nothing in the pillar carries this id. An order that was deleted takes its lines, charges and documents with it, so a link kept from before will land here."
        action={<BackToQueue />}
      />
    </Page>
  );
}

function ErrorState() {
  return (
    <Page>
      <RetryableError
        title="Could not load this order"
        message="Request failed with status 503"
        retryLabel="Retry"
        onRetry={() => {}}
      />
    </Page>
  );
}

export const states: ScreenStates = {
  loading: LoadingState,
  absent: AbsentState,
  error: ErrorState,
  'item-highlighted': () => (
    <Page>
      <LoadedOrder detail={purchaseOrder} highlightedItemId={HIGHLIGHTED_ITEM_ID} />
    </Page>
  ),
  'no-tags': () => (
    <Page>
      <LoadedOrder detail={{ ...purchaseOrder, tags: [] }} highlightedItemId={null} />
    </Page>
  ),
  minimal: () => (
    <Page>
      <LoadedOrder detail={minimalPurchaseOrder} highlightedItemId={null} />
    </Page>
  ),
};

export default function PurchaseDetailScreen() {
  return (
    <Page>
      <LoadedOrder detail={purchaseOrder} highlightedItemId={null} />
    </Page>
  );
}
