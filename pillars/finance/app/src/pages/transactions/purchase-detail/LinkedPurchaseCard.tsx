import { useTranslation } from 'react-i18next';

import { Badge, formatCents, formatDate } from '@pops/ui';

import { hasUnconfirmedLink } from './settlement';

import type { LinkedCharge, LinkedPurchase } from './types';

/**
 * One order behind the transaction on screen.
 *
 * Two amounts, because they answer different questions and a card showing
 * only one of them misleads: `linkedCents` is what this transaction paid
 * towards the order, `totalCents` is what the order cost. They differ
 * whenever an order settles in more than one charge, which is the ordinary
 * Amazon case, and the order total carries its own currency because an order
 * may be priced in one the card was not.
 */
export function LinkedPurchaseCard({ entry }: { entry: LinkedPurchase }) {
  const { t } = useTranslation('finance');
  const { purchase } = entry;
  const settlementCurrency = entry.charges[0]?.charge.currency ?? purchase.currency;

  return (
    <li
      data-purchase-id={purchase.id}
      data-unconfirmed={hasUnconfirmedLink(entry)}
      className="rounded-md border p-4 space-y-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">
            {purchase.merchantEntityName ?? t('transactions.purchaseDetail.merchantUnnamed')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('transactions.purchaseDetail.orderedAt', {
              date: formatDate(purchase.orderedAt),
            })}
          </p>
        </div>
        <div className="text-right" data-testid="purchase-share">
          <p className="tabular-nums font-medium">
            {formatCents(entry.linkedCents, settlementCurrency)}
          </p>
          <p className="text-muted-foreground text-xs">{t('transactions.purchaseDetail.share')}</p>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t('transactions.purchaseDetail.orderTotal', {
          amount: formatCents(purchase.totalCents, purchase.currency),
        })}
        {purchase.sourceOrderId !== null && ` · ${purchase.sourceOrderId}`}
        {` · ${purchase.source}`}
      </p>

      <ul aria-label={t('transactions.purchaseDetail.chargesLabel')} className="space-y-2">
        {entry.charges.map((charge) => (
          <ChargeRow key={charge.charge.id} entry={charge} />
        ))}
      </ul>
    </li>
  );
}

/**
 * One charge and the link attaching it here.
 *
 * `confirmedAt` is the whole reason this row is not a single line of text: a
 * derived link is what the matcher currently believes and a sweep may withdraw
 * it, a confirmed one is a decision somebody made. Rendering them alike would
 * present a guess as a settled fact.
 */
function ChargeRow({ entry }: { entry: LinkedCharge }) {
  const { t } = useTranslation('finance');
  const { charge, link } = entry;
  const isConfirmed = link.confirmedAt !== null;

  return (
    <li
      data-charge-id={charge.id}
      data-confirmed={isConfirmed}
      className="rounded border border-dashed px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          {t(`transactions.purchaseDetail.role.${charge.role}`)} ·{' '}
          {t(`transactions.purchaseDetail.origin.${charge.origin}`)}
        </span>
        <span className="tabular-nums">{formatCents(link.amountCents, charge.currency)}</span>
      </div>
      {link.amountCents !== charge.amountCents && (
        <p className="text-muted-foreground text-xs">
          {t('transactions.purchaseDetail.ofCharge', {
            amount: formatCents(charge.amountCents, charge.currency),
          })}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant={isConfirmed ? 'secondary' : 'outline'}>
          {isConfirmed
            ? t('transactions.purchaseDetail.confirmed')
            : t('transactions.purchaseDetail.autoLinked')}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {t(`transactions.purchaseDetail.linkType.${link.linkType}`)} ·{' '}
          {t('transactions.purchaseDetail.confidence', {
            percent: Math.round(link.confidence * 100),
          })}
        </span>
      </div>
      {!isConfirmed && (
        <p className="text-muted-foreground mt-1 text-xs">
          {t('transactions.purchaseDetail.autoLinkedHint')}
        </p>
      )}
    </li>
  );
}
