import { useTranslation } from 'react-i18next';

import { formatCents, formatDate } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PurchaseDocument, PurchaseShipment } from './types.js';

interface ShipmentListProps {
  shipments: PurchaseShipment[];
  currency: string;
}

/** How the order arrived, one entry per shipment the merchant split it into. */
export function ShipmentList({ shipments, currency }: ShipmentListProps): ReactElement {
  const { t } = useTranslation('purchases');

  if (shipments.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('purchase.shipments.empty')}</p>;
  }

  return (
    <ul aria-label={t('purchase.shipments.ariaLabel')} className="space-y-2">
      {shipments.map((shipment) => (
        <li
          key={shipment.id}
          data-shipment-status={shipment.status}
          className="rounded-md border p-3 text-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{t(`purchase.shipments.status.${shipment.status}`)}</p>
            <p className="tabular-nums">{formatCents(shipment.shippingCents, currency)}</p>
          </div>
          <p className="text-muted-foreground text-xs">
            {shipment.carrier ?? t('purchase.shipments.noCarrier')}
            {shipment.trackingNumber !== null && ` · ${shipment.trackingNumber}`}
            {shipment.deliveredAt !== null &&
              ` · ${t('purchase.shipments.delivered', { date: formatDate(shipment.deliveredAt) })}`}
            {shipment.deliveredAt === null &&
              shipment.shippedAt !== null &&
              ` · ${t('purchase.shipments.shipped', { date: formatDate(shipment.shippedAt) })}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The paperwork behind the order.
 *
 * `documentUri` is a soft `pops://` reference into the documents pillar, and
 * a stale marker says the reference was last resolved against a document that
 * has since moved or gone. Shown as the URI it is: this app cannot follow it,
 * and a link that 404s reads as a broken page rather than a stale pointer.
 */
export function DocumentList({ documents }: { documents: PurchaseDocument[] }): ReactElement {
  const { t } = useTranslation('purchases');

  if (documents.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('purchase.documents.empty')}</p>;
  }

  return (
    <ul aria-label={t('purchase.documents.ariaLabel')} className="space-y-2 text-sm">
      {documents.map((document) => (
        <li key={document.id} data-document-kind={document.kind} className="rounded-md border p-3">
          <p className="font-medium">{t(`purchase.documents.kind.${document.kind}`)}</p>
          <p className="text-muted-foreground font-mono text-xs break-all">
            {document.documentUri}
          </p>
          {document.documentStaleAt !== null && (
            <p className="text-warning text-xs">
              {t('purchase.documents.stale', { date: formatDate(document.documentStaleAt) })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
