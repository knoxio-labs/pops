import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { Button, PageHeader } from '@pops/ui';

import { formatCents } from '../money.js';
import { AccountingSplit } from './purchase-detail/AccountingSplit.js';
import { ChargeList } from './purchase-detail/ChargeList.js';
import { DocumentList, ShipmentList } from './purchase-detail/DeliveryList.js';
import { LineList } from './purchase-detail/LineList.js';
import { OrderIdentity } from './purchase-detail/OrderIdentity.js';
import {
  usePurchaseDetail,
  type PurchaseDetailModel,
} from './purchase-detail/usePurchaseDetail.js';

import type { ReactElement, ReactNode } from 'react';

import type { PurchaseDetail } from './purchase-detail/types.js';

/**
 * `/purchases/:purchaseId` — one order, whole.
 *
 * The destination every other surface in this app was missing. The reconcile
 * queue, the receipt drop zone and a global-search hit all produce a purchase
 * id and had nowhere to send it, which made each of them a dead end rather
 * than a step.
 *
 * A line-item search hit lands here too, at `?item=<id>`: the pillar reads a
 * line only through its order (`GET /purchases/{id}/items/{itemId}`), so the
 * order is the page a line has, and the query names which line was asked for.
 */
export function PurchaseDetailPage(): ReactElement {
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const [searchParams] = useSearchParams();
  const model = usePurchaseDetail(purchaseId ?? '');

  return (
    <div className="space-y-6 p-6">
      <PurchaseDetailBody model={model} highlightedItemId={searchParams.get('item')} />
    </div>
  );
}

interface PurchaseDetailBodyProps {
  model: PurchaseDetailModel;
  highlightedItemId: string | null;
}

function PurchaseDetailBody({ model, highlightedItemId }: PurchaseDetailBodyProps): ReactElement {
  const { t } = useTranslation('purchases');

  switch (model.state) {
    case 'loading':
      return (
        <p role="status" className="text-muted-foreground text-sm">
          {t('purchase.loading')}
        </p>
      );

    case 'absent':
      return (
        <div className="rounded-md border border-dashed p-10 text-center">
          <p className="mb-2 text-base font-medium">{t('purchase.absent.title')}</p>
          <p className="text-muted-foreground mb-3 text-sm">{t('purchase.absent.hint')}</p>
          <BackToQueue />
        </div>
      );

    case 'failed':
      return (
        <div role="alert" className="border-destructive/50 bg-destructive/10 rounded-md border p-4">
          <p className="mb-2 text-sm font-medium">{t('purchase.error.title')}</p>
          <p className="text-muted-foreground mb-3 text-xs">{model.failure.message}</p>
          <Button size="sm" variant="outline" onClick={model.refetch}>
            {t('purchase.error.retry')}
          </Button>
        </div>
      );

    case 'ready':
      return <LoadedOrder detail={model.detail} highlightedItemId={highlightedItemId} />;
  }
}

function LoadedOrder({
  detail,
  highlightedItemId,
}: {
  detail: PurchaseDetail;
  highlightedItemId: string | null;
}): ReactElement {
  const { t } = useTranslation('purchases');
  const { purchase, accounting, items, charges, shipments, documents, tags } = detail;
  const { currency } = purchase;

  usePageContextFor(detail);

  return (
    <>
      <PageHeader
        title={purchase.merchantEntityName ?? t('purchase.unnamedMerchant')}
        description={t('purchase.subtitle', {
          total: formatCents(purchase.totalCents, currency),
          source: purchase.source,
        })}
      />

      <BackToQueue />

      <OrderIdentity purchase={purchase} />

      <Section title={t('purchase.accounting.heading')}>
        <AccountingSplit accounting={accounting} currency={currency} />
      </Section>

      <Section title={t('purchase.items.heading', { count: items.length })}>
        <LineList lines={items} currency={currency} highlightedItemId={highlightedItemId} />
      </Section>

      <Section title={t('purchase.charges.heading', { count: charges.length })}>
        <ChargeList charges={charges} />
      </Section>

      <Section title={t('purchase.shipments.heading', { count: shipments.length })}>
        <ShipmentList shipments={shipments} currency={currency} />
      </Section>

      <Section title={t('purchase.documents.heading', { count: documents.length })}>
        <DocumentList documents={documents} />
      </Section>

      <Section title={t('purchase.tags.heading')}>
        <OrderTags tags={tags} />
      </Section>
    </>
  );
}

/**
 * Register the order as the entity being viewed, so the shell's assistant and
 * its context header name this order rather than the pillar.
 */
function usePageContextFor(detail: PurchaseDetail): void {
  const { t } = useTranslation('purchases');
  const { id, merchantEntityName } = detail.purchase;
  const unnamed = t('purchase.unnamedMerchant');

  // Memoised because the hook re-runs its effect whenever the entity's
  // identity changes, and a fresh object each render sets state on every
  // render — which sets state again.
  const entity = useMemo(
    () => ({
      uri: `pops:purchases/purchase/${id}`,
      type: 'purchase',
      title: merchantEntityName ?? unnamed,
    }),
    [id, merchantEntityName, unnamed]
  );

  useSetPageContext({ page: 'purchase-detail', pageType: 'drill-down', entity });
}

function OrderTags({ tags }: { tags: string[] }): ReactElement {
  const { t } = useTranslation('purchases');

  if (tags.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('purchase.tags.empty')}</p>;
  }

  return (
    <ul aria-label={t('purchase.tags.ariaLabel')} className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag} className="bg-muted rounded px-2 py-0.5 text-xs">
          {tag}
        </li>
      ))}
    </ul>
  );
}

function BackToQueue(): ReactElement {
  const { t } = useTranslation('purchases');
  return (
    <Link to="/purchases" className="text-sm underline underline-offset-4">
      {t('purchase.backToQueue')}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}
