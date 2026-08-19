import { DIGITAL_ORDERS_CSV } from '../amazon-digital/__tests__/__fixtures__/digital-orders.js';
import { parseAmazonDigitalOrders } from '../amazon-digital/digital-orders.js';
/**
 * Every shipped adapter, driven over its own fixture, reduced to the lines
 * it produces.
 *
 * Shared because two rules are asserted over the same adapters and neither
 * owns them: what an adapter must not classify
 * (`no-asserted-classification.test.ts`) and what identity it can actually
 * state (`product-identity.test.ts`). A second copy of these drivers would
 * be a second thing to update the day a fixture changes, and the one left
 * behind would keep passing.
 *
 * {@link ADAPTERS} is the list both rules run over, so a new adapter is
 * covered by adding it here once rather than in each suite.
 */
import { ORDER_HISTORY_CSV } from '../amazon/__tests__/__fixtures__/order-history.js';
import { parseAmazonOrderHistory } from '../amazon/order-history.js';
import { ExtractedReceiptSchema } from '../receipt/extraction.js';
import { gateExtraction } from '../receipt/gate.js';
import { receiptToPurchase } from '../receipt/purchase.js';
import { receiptUri } from '../receipt/store.js';
import { receiptPage } from '../woolworths/__tests__/fixtures.js';
import { mapReceipt } from '../woolworths/receipt.js';

import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ReceiptPage } from '../woolworths/blocks.js';

function itemsOf(purchases: readonly CreatePurchaseInput[]): readonly CreateItemInput[] {
  return purchases.flatMap((purchase) => purchase.items ?? []);
}

export function amazonItems(): readonly CreateItemInput[] {
  return itemsOf(parseAmazonOrderHistory(ORDER_HISTORY_CSV).orders);
}

export function amazonDigitalItems(): readonly CreateItemInput[] {
  return itemsOf(parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV).orders);
}

export function woolworthsItems(): readonly CreateItemInput[] {
  const mapped = mapReceipt('activity-1', receiptPage() as ReceiptPage);
  if (mapped === null) throw new Error('the Woolworths fixture stopped mapping');
  return mapped.purchase.items ?? [];
}

export function receiptItems(): readonly CreateItemInput[] {
  const sha = 'a'.repeat(64);
  const extracted = ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
    total: '$27.50',
    tax: null,
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: '$15.00', unitNote: '2 @ $7.50' },
    ],
  });
  const gate = gateExtraction(extracted);
  if (!gate.admissible) throw new Error('receipt fixture stopped reconciling');
  return (
    receiptToPurchase(
      extracted,
      gate,
      [
        {
          sha256: sha,
          path: `/data/receipts/aa/${sha}.jpg`,
          uri: receiptUri(sha),
          bytes: 1234,
          alreadyPresent: false,
        },
      ],
      { uploadedAt: '2026-08-06T23:11:00.000Z' }
    ).purchase.items ?? []
  );
}

export const ADAPTERS: readonly (readonly [string, () => readonly CreateItemInput[]])[] = [
  ['amazon', amazonItems],
  ['amazon-digital', amazonDigitalItems],
  ['woolworths', woolworthsItems],
  ['receipt', receiptItems],
];
