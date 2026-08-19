import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button, formatDate } from '@pops/ui';

import { formatCents } from '../../money.js';
import { merchantLabel } from './merchant-label.js';
import { useMerchantOrders } from './useMerchantOrders.js';

import type { ReactElement } from 'react';

import type { MerchantOrder, MerchantSpend, SpendPeriod } from './types.js';

interface Props {
  merchant: MerchantSpend;
  period: SpendPeriod;
  regionId: string;
}

/**
 * The orders one merchant row was totalled from, each opening its own detail
 * page.
 *
 * This is the layer the roll-up was missing. A row naming $151.20 as
 * unexplained is where a reader forms the question `/purchases/:purchaseId`
 * answers, and while it could not be opened, naming the figure was a weaker
 * version of hiding it.
 *
 * Mounted only once its row is open, which is also what makes the request
 * conditional: a lens over a year renders every merchant at once, and
 * fetching eagerly would issue one request per row for lists nobody asked to
 * see.
 */
export function MerchantOrders({ merchant, period, regionId }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const model = useMerchantOrders(merchant, period);

  if (model.state === 'loading') {
    return (
      <p id={regionId} role="status" className="text-muted-foreground text-xs">
        {t('merchants.drilldown.loading')}
      </p>
    );
  }

  if (model.state === 'failed') {
    return (
      <div id={regionId} role="alert" className="space-y-2">
        <p className="text-xs font-medium">{t('merchants.drilldown.error.title')}</p>
        <p className="text-muted-foreground text-xs">{model.failure.message}</p>
        <Button size="sm" variant="outline" onClick={model.refetch}>
          {t('merchants.drilldown.error.retry')}
        </Button>
      </div>
    );
  }

  if (model.orders.length === 0) {
    // Not an ordinary empty state: this row was rendered because the roll-up
    // counted orders here, so nothing coming back means the two reads
    // disagree rather than that there is nothing to show.
    return (
      <p id={regionId} className="text-warning text-xs">
        {t('merchants.drilldown.none', { count: model.counted })}
      </p>
    );
  }

  return (
    <div id={regionId} className="space-y-2">
      <ul
        className="divide-y rounded-md border"
        aria-label={t('merchants.drilldown.ariaLabel', {
          merchant: merchantLabel(merchant.merchant, t),
        })}
      >
        {model.orders.map((order) => (
          <li key={order.id}>
            <OrderRow order={order} />
          </li>
        ))}
      </ul>
      {model.orders.length < model.counted && (
        <p className="text-warning text-xs">
          {t('merchants.drilldown.truncated', {
            shown: model.orders.length,
            counted: model.counted,
          })}
        </p>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: MerchantOrder }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <Link
      to={`/purchases/${order.id}`}
      className="hover:bg-muted/50 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span>{formatDate(order.orderedAt)}</span>
        <span className="text-muted-foreground text-xs">
          {order.sourceOrderId ?? t('merchants.drilldown.noReference')}
        </span>
        <span className="text-muted-foreground text-xs">
          {t(`purchase.status.${order.status}`)}
        </span>
      </span>
      <span className="text-sm font-medium tabular-nums">
        {formatCents(order.totalCents, order.currency)}
      </span>
    </Link>
  );
}
