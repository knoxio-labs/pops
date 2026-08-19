/**
 * The collision this adapter exists to survive: a digital Order ID that is
 * byte-identical to a physical one.
 *
 * The reference bundle has no such pair — 90 digital ids, 748 physical, no
 * overlap, and every digital one prefixed `D01-`. That is a property of one
 * download rather than something Amazon promises, and the cost of being
 * wrong is not a crash: `purchases.checksum` is globally unique and
 * `(source, sourceOrderId)` is unique per source, so the second import of a
 * colliding pair would come back as a 409 the backfill counts as "already
 * had it" and prints as a skip. A whole digital order would go missing and
 * the run would report success.
 *
 * Both halves of the guard are asserted here, end to end: the two orders
 * hash differently, and the database accepts them both.
 */
import { describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../../db/__tests__/helpers.js';
import { createPurchase, DuplicatePurchaseError, upsertSource } from '../../../db/index.js';
import { AMAZON_SOURCE_ID, parseAmazonOrderHistory } from '../../amazon/index.js';
import { AMAZON_DIGITAL_SOURCE_ID, parseAmazonDigitalOrders } from '../index.js';
import { DIGITAL_ORDERS_CSV, ORDER_COLLIDES_WITH_PHYSICAL } from './__fixtures__/digital-orders.js';

import type { CreatePurchaseInput } from '../../../db/services/purchase-input.js';

const digital = parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV);

function digitalOrder(): CreatePurchaseInput {
  const found = digital.orders.find(
    (order) => order.sourceOrderId === ORDER_COLLIDES_WITH_PHYSICAL
  );
  if (found === undefined) throw new Error('the colliding digital order was not parsed');
  return found;
}

/**
 * The same order id coming out of the physical parser.
 *
 * Built through the real order-history parser rather than hand-written, so
 * the checksum being compared is the one a real backfill would produce
 * rather than one this test chose to make different.
 */
function physicalOrder(): CreatePurchaseInput {
  const header = [
    'ASIN',
    'Carrier Name & Tracking Number',
    'Currency',
    'Order Date',
    'Order ID',
    'Order Status',
    'Original Quantity',
    'Payment Method Type',
    'Product Name',
    'Ship Date',
    'Shipment Item Subtotal',
    'Shipment Item Subtotal Tax',
    'Shipment Status',
    'Shipping Charge',
    'Total Amount',
    'Total Discounts',
    'Unit Price',
  ];
  const row = [
    'B000000001',
    'AMZL(TBA000)',
    'AUD',
    '2025-02-18T11:30:00Z',
    ORDER_COLLIDES_WITH_PHYSICAL,
    'Shipped',
    '1',
    'Visa - 7373',
    'A Physical Thing',
    '2025-02-19T00:00:00Z',
    '4.99',
    '0.50',
    'Shipped',
    '0',
    '5.49',
    '0',
    '4.99',
  ];
  const csv = `${header.join(',')}\n${row.join(',')}\n`;
  const [parsed] = parseAmazonOrderHistory(csv).orders;
  if (parsed === undefined) throw new Error('the physical fixture did not parse');
  return parsed;
}

describe('an order id shared across the two namespaces', () => {
  it('is parsed under two different sources', () => {
    expect(digitalOrder().source).toBe(AMAZON_DIGITAL_SOURCE_ID);
    expect(physicalOrder().source).toBe(AMAZON_SOURCE_ID);
    expect(digitalOrder().sourceOrderId).toBe(physicalOrder().sourceOrderId);
  });

  it('hashes to two different checksums', () => {
    // `purchases.checksum` is unique GLOBALLY, not per source, so a shared
    // recipe here would make the second import a duplicate of an order it
    // has nothing to do with. The source id is hashed first for exactly
    // this reason.
    expect(digitalOrder().checksum).not.toBe(physicalOrder().checksum);
  });

  it('is written twice rather than deduplicated', () => {
    const { opened, cleanup } = openTempDb();
    try {
      seedAmazonSource(opened);
      upsertSource(opened.db, {
        id: AMAZON_DIGITAL_SOURCE_ID,
        label: 'Amazon Digital',
        descriptorPattern: null,
        settlementWindowDays: 3,
        autoLinkPolicy: 'review',
        ingestAdapter: 'amazon-dsar-digital',
      });

      const physicalId = createPurchase(opened.db, physicalOrder());
      const digitalId = createPurchase(opened.db, digitalOrder());

      expect(digitalId).not.toBe(physicalId);
    } finally {
      cleanup();
    }
  });

  it('is still rejected when the SAME source states it twice', () => {
    // The other half of the invariant. Namespacing must not have widened
    // the key to the point where a genuine re-import stops being caught.
    const { opened, cleanup } = openTempDb();
    try {
      upsertSource(opened.db, {
        id: AMAZON_DIGITAL_SOURCE_ID,
        label: 'Amazon Digital',
        descriptorPattern: null,
        settlementWindowDays: 3,
        autoLinkPolicy: 'review',
        ingestAdapter: 'amazon-dsar-digital',
      });

      createPurchase(opened.db, digitalOrder());

      // A different checksum on purpose: this must be caught by the id
      // rather than by the content hash, which is the guard that survives
      // an adapter changing how it hashes a row.
      let raised: unknown;
      try {
        createPurchase(opened.db, { ...digitalOrder(), checksum: 'a-different-checksum' });
      } catch (error) {
        raised = error;
      }
      if (!(raised instanceof DuplicatePurchaseError)) {
        throw new Error(`expected a DuplicatePurchaseError but got ${String(raised)}`);
      }
      expect(raised.matchedOn).toBe('source-order-id');
    } finally {
      cleanup();
    }
  });
});
