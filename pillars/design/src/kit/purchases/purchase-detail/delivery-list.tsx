import { formatCents } from '@pops/ui';

import { documentStaleNote, shipmentMetaLine } from './format';
import { DOCUMENT_KIND_LABELS, SHIPMENT_STATUS_LABELS } from './labels';

import type { OrderDocument, OrderShipment } from '@/fixtures/purchases-order-types';

/** How the order arrived, one entry per shipment the merchant split it into. */
export function ShipmentList({
  shipments,
  currency,
}: {
  shipments: OrderShipment[];
  currency: string;
}) {
  if (shipments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">The merchant sent no delivery for this order.</p>
    );
  }

  return (
    <ul aria-label="Deliveries for this order" className="space-y-2">
      {shipments.map((shipment) => (
        <li
          key={shipment.id}
          data-shipment-status={shipment.status}
          className="rounded-md border p-3 text-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{SHIPMENT_STATUS_LABELS[shipment.status]}</p>
            <p className="tabular-nums">{formatCents(shipment.shippingCents, currency)}</p>
          </div>
          <p className="text-xs text-muted-foreground">{shipmentMetaLine(shipment)}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The paperwork behind the order.
 *
 * `documentUri` is a soft `pops://` reference into the documents pillar,
 * and a stale marker says the reference was last resolved against a
 * document that has since moved or gone. Shown as the URI it is: this
 * screen cannot follow it, and a link that 404s reads as a broken page
 * rather than a stale pointer.
 */
export function DocumentList({ documents }: { documents: OrderDocument[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No document is attached to this order.</p>;
  }

  return (
    <ul aria-label="Documents behind this order" className="space-y-2 text-sm">
      {documents.map((document) => {
        const stale = documentStaleNote(document);
        return (
          <li
            key={document.id}
            data-document-kind={document.kind}
            className="rounded-md border p-3"
          >
            <p className="font-medium">{DOCUMENT_KIND_LABELS[document.kind]}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {document.documentUri}
            </p>
            {stale !== null && <p className="text-xs text-warning">{stale}</p>}
          </li>
        );
      })}
    </ul>
  );
}
