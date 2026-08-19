/**
 * Assembly of one delivery and its lines.
 *
 * This is where the export's mixed grain is resolved. `Shipment Item
 * Subtotal`, its tax and `Shipping Charge` are stated once per SHIPMENT and
 * repeated verbatim on each of its rows — identical on 91 of 91 multi-item
 * shipments in the reference bundle — so they are read from the first row
 * and never accumulated. `Total Amount` and `Total Discounts` are the
 * opposite: they are the line's allocated share and are summed per row.
 *
 * Reading all of them at row level does not throw. It multiplies the
 * subtotal of every multi-item shipment by its line count.
 *
 * `Shipping Charge` is stated once per shipment and never allocated by the
 * export itself, unlike `Total Amount`. So it is split here, pro-rata by
 * each line's own `lineTotalCents`, via {@link allocateProRata} — the same
 * basis the export already uses for `Total Amount` and `Total Discounts`.
 */

import { allocateProRata } from '../allocation.js';
import { SHIPMENT_STATUS_BY_SOURCE_VALUE, type AmazonAnomaly, type Row } from './columns.js';
import {
  readCarrierAndTracking,
  readCents,
  readProductIdentity,
  readQuantity,
  readText,
  readTimestampWithAnomaly,
} from './fields.js';

import type { CreateItemInput, CreateShipmentInput } from '../../db/services/purchase-input.js';

/**
 * Tolerance for `subtotal + tax + shipping + discounts === Σ line totals`.
 *
 * The identity holds on 735 of 747 shipments in the reference bundle; the
 * twelve misses are between one and four dollars and cluster on older
 * orders. They are recorded and ingested rather than rejected — the order
 * happened, and the merchant's arithmetic is what it is (ADR-042).
 */
const COMPONENT_SUM_TOLERANCE_CENTS = 2;

export interface BuiltShipment {
  readonly shipment: CreateShipmentInput;
  readonly items: readonly CreateItemInput[];
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

export function buildShipment(
  ref: string,
  rows: readonly Row[],
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): BuiltShipment | null {
  const first = rows[0];
  if (first === undefined) return null;

  const shipDate = readTimestampWithAnomaly(first['Ship Date']);
  if (shipDate.concatenated) {
    anomalies.push({
      kind: 'concatenated-ship-date',
      sourceOrderId,
      detail: 'ship date held two timestamps joined by " and "; the first was taken',
    });
  }

  const shippingCents = readCents(first['Shipping Charge']) ?? 0;
  // Null rather than 0: a cancelled shipment states "Not Available", and
  // treating that as zero manufactures a mismatch against an amount the
  // merchant never claimed.
  const statedSubtotal = readCents(first['Shipment Item Subtotal']);
  const taxCents = readCents(first['Shipment Item Subtotal Tax']) ?? 0;

  const { carrier, trackingNumber } = readCarrierAndTracking(
    first['Carrier Name & Tracking Number']
  );

  const { items, totalCents, discountCents } = collectLines(rows, ref, sourceOrderId, anomalies);

  reportComponentMismatch({
    statedSubtotal,
    taxCents,
    shippingCents,
    discountCents,
    totalCents,
    sourceOrderId,
    anomalies,
  });

  // Matches the shipment row below: a cancelled shipment's "Not Available"
  // already read as 0 above, and postage can never be a negative charge to
  // an item.
  const shipmentShippingCents = Math.max(shippingCents, 0);
  const shippingShares = allocateProRata(
    shipmentShippingCents,
    items.map((item) => item.lineTotalCents)
  );
  const itemsWithShipping = items.map((item, index) => ({
    ...item,
    allocatedShippingCents: shippingShares[index] ?? 0,
  }));

  return {
    shipment: {
      ref,
      sourceShipmentRef: ref,
      carrier,
      trackingNumber,
      shippedAt: shipDate.value,
      status: readShipmentStatus(first['Shipment Status']),
      shippingCents: shipmentShippingCents,
    },
    items: itemsWithShipping,
    subtotalCents: statedSubtotal ?? 0,
    taxCents,
    shippingCents,
    discountCents,
    totalCents,
  };
}

/**
 * Read every line of one shipment, accumulating the two per-LINE amounts.
 * `Total Amount` is the line's allocated share including tax and postage,
 * which is why it is summed here while the subtotal is not.
 */
function collectLines(
  rows: readonly Row[],
  shipmentRef: string,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): { items: CreateItemInput[]; totalCents: number; discountCents: number } {
  const items: CreateItemInput[] = [];
  let totalCents = 0;
  let discountCents = 0;

  for (const row of rows) {
    const lineTotal = readCents(row['Total Amount']);
    if (lineTotal === null) {
      anomalies.push({
        kind: 'unparseable-money',
        sourceOrderId,
        detail: `line "${readText(row['ASIN']) ?? 'unknown ASIN'}" has an unreadable Total Amount`,
      });
    }
    totalCents += lineTotal ?? 0;
    discountCents += readCents(row['Total Discounts']) ?? 0;

    const item = buildItem(row, shipmentRef, sourceOrderId, anomalies);
    if (item !== null) items.push(item);
  }

  return { items, totalCents, discountCents };
}

function reportComponentMismatch(input: {
  statedSubtotal: number | null;
  taxCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  sourceOrderId: string;
  anomalies: AmazonAnomaly[];
}): void {
  if (input.statedSubtotal === null) return;

  const stated = input.statedSubtotal + input.taxCents + input.shippingCents + input.discountCents;
  if (Math.abs(stated - input.totalCents) <= COMPONENT_SUM_TOLERANCE_CENTS) return;

  input.anomalies.push({
    kind: 'component-sum-mismatch',
    sourceOrderId: input.sourceOrderId,
    detail:
      `shipment components sum to ${String(stated)}c but its lines total ` +
      `${String(input.totalCents)}c`,
  });
}

function buildItem(
  row: Row,
  shipmentRef: string,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): CreateItemInput | null {
  const name = readText(row['Product Name']);
  const unitPriceCents = readCents(row['Unit Price']);
  if (name === null || unitPriceCents === null) {
    anomalies.push({
      kind: 'dropped-line',
      sourceOrderId,
      detail:
        `line "${readText(row['ASIN']) ?? name ?? 'unknown'}" was not ingested: ` +
        (name === null ? 'no product name' : 'unreadable Unit Price'),
    });
    return null;
  }

  const rawQuantity = readQuantity(row['Original Quantity']);
  if (rawQuantity === 0) {
    anomalies.push({
      kind: 'zero-quantity-line',
      sourceOrderId,
      detail: `line "${readText(row['ASIN']) ?? name}" has quantity 0; ingested as 1`,
    });
  }

  // The contract's minimum is 1. A cancelled line is still a line that was
  // ordered, so it is kept at 1 and flagged rather than dropped.
  const quantity = rawQuantity === null || rawQuantity < 1 ? 1 : rawQuantity;

  return {
    shipmentRef,
    name,
    // The one product identity any shipped adapter can state. `asin` names
    // the namespace so a later grouping knows an ASIN means the same product
    // wherever it turns up, and that a store's own article number does not.
    sku: readProductIdentity(row['ASIN']),
    quantity,
    unitPriceCents,
    // Σ(Unit Price × Quantity) reconstructs Shipment Item Subtotal exactly
    // on 747/747 shipments, so this is the line's own economics rather than
    // its allocated share of tax and postage.
    lineTotalCents: unitPriceCents * quantity,
    allocatedAdjustmentCents: readCents(row['Total Discounts']) ?? 0,
    // `Product Condition` — `New` on 940 of 943 rows in the reference
    // bundle, `Used` on 3. A condition, not a category: the export has 28
    // columns and none of them states what the thing IS.
    merchantCondition: readText(row['Product Condition']),
  };
}

function readShipmentStatus(raw: string | undefined): CreateShipmentInput['status'] {
  const text = readText(raw);
  if (text === null) return 'pending';
  // "Shipped and Shipped" appears where an item shipped in two parts.
  const first = (text.split(' and ')[0] ?? text).trim().toLowerCase();
  return SHIPMENT_STATUS_BY_SOURCE_VALUE.get(first) ?? 'pending';
}
