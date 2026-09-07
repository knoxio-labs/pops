/**
 * The composed strings the order-detail lists render — pulled out of JSX so
 * the conditional joins (a missing SKU, a zero refund, a charge with no
 * date) are covered by tests rather than only by eyeballing the screen.
 */
import { formatCents, formatDate } from '@pops/ui';

import { CHARGE_ORIGIN_LABELS, CHARGE_ROLE_LABELS, ITEM_KIND_LABELS } from './labels';

import type {
  Charge,
  ChargeLink,
  OrderDocument,
  OrderLine,
  OrderLineItem,
  OrderLineSku,
  OrderShipment,
} from '@/fixtures/purchases-order-types';

/** `1 unit` vs `2 units` — the boundary is always exactly `count === 1`. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A line's product identifier, scoped to the namespace it lives in — a bare code is ambiguous without saying which. */
export function skuLabel(sku: OrderLineSku | null): string {
  if (sku === null) return 'No SKU';
  return sku.scheme === 'asin' ? `ASIN ${sku.value}` : `Merchant code ${sku.value}`;
}

/** The line-list subheading: SKU, quantity and per-unit price, in that order because that is the order a reader checks a line against the receipt. */
export function lineMetaLine(item: OrderLineItem, currency: string): string {
  return [
    skuLabel(item.sku),
    pluralize(item.quantity, 'unit', 'units'),
    `${formatCents(item.unitPriceCents, currency)} each`,
  ].join(' · ');
}

/** The landed-cost caption for one line — refund and item kind only appear when they apply, so a plain line stays a single clause. */
export function landedCostLine(line: OrderLine, currency: string): string {
  const parts = [`Landed ${formatCents(line.landedCostCents, currency)}`];
  if (line.item.refundedCents > 0) {
    parts.push(`Refunded ${formatCents(line.item.refundedCents, currency)}`);
  }
  if (line.item.kind !== null) parts.push(ITEM_KIND_LABELS[line.item.kind.value]);
  return parts.join(' · ');
}

/** A charge's heading — role first, since a reader scanning the list distinguishes a capture from a refund before caring who originated it. */
export function chargeHeadingLine(charge: Charge): string {
  return `${CHARGE_ROLE_LABELS[charge.role]} · ${CHARGE_ORIGIN_LABELS[charge.origin]}`;
}

/** A charge's caption. `allocationCount` is the count already resolved by the caller, not recomputed here, so this stays a pure formatter. */
export function chargeMetaLine(charge: Charge, allocationCount: number): string {
  const parts = [charge.chargedAt === null ? 'No charge date' : formatDate(charge.chargedAt)];
  if (charge.paymentHint !== null) parts.push(charge.paymentHint);
  parts.push(pluralize(allocationCount, 'line allocation', 'line allocations'));
  return parts.join(' · ');
}

/** A link's match confidence as a whole-percent label — the model's own precision is never worth showing to a reader deciding whether to trust it. */
export function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}% confident`;
}

/** Whether a human has confirmed a proposed transaction link — a link with no `confirmedAt` is only a proposal, however high its confidence. */
export function linkStatusLabel(link: ChargeLink): string {
  return link.confirmedAt === null ? 'proposed, not confirmed' : 'confirmed';
}

/** Delivered beats shipped beats nothing — the most settled fact wins. */
export function shipmentDateNote(shipment: OrderShipment): string | null {
  if (shipment.deliveredAt !== null) return `Delivered ${formatDate(shipment.deliveredAt)}`;
  if (shipment.shippedAt !== null) return `Shipped ${formatDate(shipment.shippedAt)}`;
  return null;
}

/** A shipment's caption — carrier, tracking number, and whichever date `shipmentDateNote` judges most settled, each only when the pillar has it. */
export function shipmentMetaLine(shipment: OrderShipment): string {
  const parts = [shipment.carrier ?? 'No carrier named'];
  if (shipment.trackingNumber !== null) parts.push(shipment.trackingNumber);
  const dateNote = shipmentDateNote(shipment);
  if (dateNote !== null) parts.push(dateNote);
  return parts.join(' · ');
}

/**
 * A document is "stale" once the pillar re-resolved it after the fact — the
 * link it holds may no longer be the one shown. `null` means the document
 * has never needed re-resolving, not that staleness was checked and cleared.
 */
export function documentStaleNote(document: OrderDocument): string | null {
  if (document.documentStaleAt === null) return null;
  return `Last resolved ${formatDate(document.documentStaleAt)} — the document may have moved.`;
}
